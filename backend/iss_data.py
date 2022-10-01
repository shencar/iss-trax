import logging
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from typing import List
from typing import Tuple

import requests
from pandas import DataFrame
from skyfield.api import load
from skyfield.sgp4lib import EarthSatellite
from skyfield.toposlib import wgs84

class ISSData:
    def __init__(self, path):
        self.df = self._load_data(path)

    def _load_data(self, path):
        logging.info(f'Loading ISS data from {path}')
        tle = load.tle_file(path)  # type: List[EarthSatellite]
        df = DataFrame([(i, i.epoch.utc_datetime()) for i in tle], columns=['satellite', 'dt'])
        return df

    def get_approximate_position(self, timestamp: int):
        ts = load.timescale()
        time = datetime.fromtimestamp(timestamp)
        t = ts.utc(time.year, time.month, time.day, time.hour, time.minute, time.second)
        last_position = self._get_closest_known_entry(timestamp)
        logging.info(f'Closest reported position: {last_position.epoch.utc_datetime()}')
        geocentric = last_position.at(t)
        lat, lon = wgs84.latlon_of(geocentric)
        height = wgs84.height_of(geocentric).to('km')
        return {'lat': lat.degrees, 'lon': lon.degrees, 'height': height.value, 'timestamp': timestamp}


    def _get_closest_known_entry(self, ts: int) -> EarthSatellite:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)

        closest_ts = self.df['dt'].searchsorted(dt) - 1
        closest_entry = self.df.loc[closest_ts]['satellite']

        if dt - closest_entry.epoch.utc_datetime() > timedelta(days=365*9):
            closest_entry = self.get_current_lte()
            closest_entry_df = DataFrame([[closest_entry, closest_entry.epoch.utc_datetime()]], columns=['satellite', 'dt'])
            self.df = self.df.append(closest_entry_df, ignore_index=True)
        return closest_entry

    def get_broad_positions(self, middle_ts: int):
        ts_list = range(middle_ts - 45 * 60, middle_ts + 45 * 60, int(90 * 60 / 100))
        return [self.get_approximate_position(i) for i in ts_list]

    def get_current_lte(self):
        logging.info('Getting current position')
        response = requests.get('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544')
        _, line1, line2 = response.text.splitlines()
        return EarthSatellite(line1, line2)
