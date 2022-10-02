import json
import logging
from datetime import datetime
from datetime import timedelta
from typing import Optional

import requests
import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pytz import timezone
from skyfield.api import load
from skyfield.toposlib import wgs84

from ground_station import load_satellites
from iss_data import ISSData


def setup_app():
    logging.info('Setting Up...')
    _app = FastAPI()

    global iss_data
    iss_data = ISSData('data/zarya.tle')
    global iss
    iss = load_satellites()['ISS (ZARYA)']

    global ground_stations
    ground_stations = json.load(open('data/ground_stations.json'))

    return _app

origins = ["*"]
app = setup_app()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/api/version')
async def version():
    return {
        'version': app.version
    }

@app.get('/api/health')
async def health():
    return {
        'status': 'OK'
    }

@app.get('/api/position')
async def get_location(timestamp: float):
    dt = datetime.fromtimestamp(timestamp)
    lat, lon, height = app.iss_data.get_approximate_position(dt)
    return {
        'lat': lat,
        'lon': lon,
        'height': height
    }


def _request_positions(ts_list):
    return requests.get(
        f'https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps={ts_list}&units=km').json()

@app.get('/api/positions')
async def get_positions_v2(ts: int):
    return iss_data.get_broad_positions(ts)

@app.get('/api/current')
async def get_current():
    return _request_positions(int(datetime.now().timestamp()))

@app.get('/api/visibility')
async def get_visibility(lat: float, lon: float):
    bluffton = wgs84.latlon(lat, lon)
    ts = load.timescale()
    t0 = ts.now()
    t1 = t0 + timedelta(weeks=4)
    t, events = iss.find_events(bluffton, t0, t1, altitude_degrees=30.0)
    res = []
    for ti, event in zip(t, events):
        if event == 2:
            res.append(ti.utc_datetime().timestamp())
    return res[:5]


@app.get('/api/ground-stations')
async def ground_station_is_observable(timestamp: Optional[float] = None):
    if timestamp is None:
        timestamp = datetime.now(tz=timezone('GMT')).timestamp()
    t = load.timescale().from_datetime(datetime.fromtimestamp(timestamp, tz=timezone('GMT')))

    for doc in ground_stations:
        logging.info(f'Checking {doc["name"]} ; {datetime.now()}')
        bluffton = wgs84.latlon(doc['lat'], doc['lon'], doc['alt'])
        difference = iss - bluffton
        topocentric = difference.at(t)
        alt, az, distance = topocentric.altaz()
        doc['visible'] =  bool(alt.degrees > 0)
    return ground_stations

app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == '__main__':
    logging.getLogger().setLevel(logging.INFO)
    uvicorn.run('server:app', host='0.0.0.0', port=4000, reload=True)