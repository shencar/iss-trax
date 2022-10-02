var BASE_URL = 'http://localhost:4000';
var BASE_URL_PROD = 'http://34.159.45.100/';

var SERVICE_URLS = {
    current: BASE_URL + '/api/current',
    history: BASE_URL + '/api/positions?ts=',
    visibility: BASE_URL + '/api/visibility',
    groundStations: BASE_URL + '/api/ground-stations'
}