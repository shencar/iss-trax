from datetime import datetime
from datetime import timezone
from functools import lru_cache

# from sgp4.earth_gravity import wgs84
# from skyfield.api import N
# from skyfield.api import W
from skyfield.api import load
from skyfield.api import N,S,E,W, wgs84


@lru_cache()
def load_planets():
    planets = load('de421.bsp')
    return planets

@lru_cache()
def load_satellites():
    stations_url = 'http://celestrak.com/NORAD/elements/stations.txt'
    satellites = load.tle_file(stations_url)
    return {sat.name: sat for sat in satellites}


class GroundStation:
    EARTH = load_planets()['earth']

    def __init__(self, lat, lon, elevation, name):
        self.lat = lat
        self.lon = lon
        self.elevation = elevation
        self.name = name

    @property
    def sf_obj(self):
        return wgs84.latlon(self.lat, self.lon, self.elevation)

    def is_iss_observable(self, timestamp):
        iss = load_satellites()['ISS (ZARYA)']
        difference = iss - self.sf_obj
        ts = load.timescale()
        topocentric = difference.at(ts.now())
        alt, az, distance = topocentric.altaz()
        return alt.degrees > 0