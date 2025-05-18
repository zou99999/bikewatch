// Import D3 functions as an ESM module
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZnpvdSIsImEiOiJjbWF0MnFlZnkwYTFqMnFvaXY5YmozdjNvIn0.W4o_J65TD__zq1HP9P6yhA';

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
  }

let timeFilter = -1; // -1 = any time

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}
  
function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);
  
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });
}
  
function filterTripsByTime(trips, timeFilter) {
    return timeFilter === -1
      ? trips
      : trips.filter((trip) => {
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });
}

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

map.on('load', async () => {
    //Boston bike lane
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
      });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': 'green',
          'line-width': 3,
          'line-opacity': 0.4,
        },
      });
    
    //Cambridge bike lane
    map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });

    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
        'line-color': 'green',
        'line-width': 3,
        'line-opacity': 0.4,
        },
    });

    let jsonData;
    try {
        const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
      
        // Await JSON fetch
        jsonData = await d3.json(jsonurl);
      
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }
    

    const trafficUrl = "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";
    let trips = await d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        (trip) => {
          trip.started_at = new Date(trip.started_at);
          trip.ended_at = new Date(trip.ended_at);
          return trip;
        },
      );
    console.log("Loaded Trips:", trips);
    let stations = computeStationTraffic(jsonData.data.stations, trips);
    console.log('Stations Array:', stations);

    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id
    );
    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
    );

    stations = stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });

    // Select the SVG
    const svg = d3.select('#map').select('svg');

    // Create the radius scale AFTER totalTraffic exists
    const radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

    // Create circles for each station
    const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('fill', 'steelblue')
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

    // Update their positions
    function updatePositions() {
        circles
        .attr('cx', (d) => getCoords(d).cx)
        .attr('cy', (d) => getCoords(d).cy);
    }

    updatePositions();

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);


    const timeSlider = document.getElementById('timeSlider');
    const selectedTime = document.getElementById('selectedTime');
    const anyTimeLabel = document.getElementById('anyTime');

    function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);
      
        if (timeFilter === -1) {
          selectedTime.textContent = '';
          anyTimeLabel.style.display = 'block';
        } else {
          selectedTime.textContent = formatTime(timeFilter);
          anyTimeLabel.style.display = 'none';
        }
      
        updateScatterPlot(timeFilter); 
      }
      
    //Step 5.3
    function updateScatterPlot(timeFilter) {
        const filteredTrips = filterTripsByTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);
      
        // Adjust radius scale range based on filtering
        timeFilter === -1
          ? radiusScale.range([0, 25])
          : radiusScale.range([3, 50]);
      
        // Update circle sizes
        circles
          .data(filteredStations, d => d.short_name)
          .join('circle')
          .attr('r', (d) => radiusScale(d.totalTraffic));
      }
    
    updateScatterPlot(-1);
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay(); // Call once on load
});

  