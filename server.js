// Import required modules
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const axios = require('axios');
const WebSocket = require('ws');

// Initialize the application
const app = express();
const PORT = 5000;
const espIp = "http://192.168.1.4:8080"; // Update this with the ESP32 IP

// Middleware
app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
const wss = new WebSocket.Server({ port: 8081 }); // WebSocket server on port 8081

// Broadcast function to send data to all connected clients
const broadcastData = async () => {
  const data = JSON.stringify(sensorData);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      await client.send(data);
    }
  }
};
// Placeholder data for the irrigation system
let sensorData = {
  moisture: '--',
  temperature: '--',
  humidity: '--',
  pumpStatus: 'OFF', // Manual control status
  autoPump: 'OFF',   // Arduino-controlled pump status
};


// Serve the frontend to display data and control the system
app.get('/', (req, res) => {
  res.render('index', { sensorData });
});

// Endpoint to receive data from the Arduino/ESP32
app.get('/sensor-data', (req, res) => {
  const { type, value } = req.query;
  console.log(`Updated ${type}: ${value}`);

  // Check if type or value is missing
  if (!type || value === undefined) {
    sensorData = {
      moisture: null,
      temperature: null,
      humidity: null,
    };
    broadcastData()
    return res.status(400).send({ error: 'Missing type or value in query parameters' });
  }

  const parsedValue = Number.parseFloat(value);

  // If value is -1, ignore it or set to null (depending on how you want to handle it)
  if (parsedValue === -1) {
    return res.status(400).send({ message: "value is -1" });

  }

  // Update the specified sensor data type if it exists
  if (type in sensorData) {
    sensorData[type] = type === 'autoPump' ? (value === 'ON' ? 'ON' : 'OFF') : parsedValue;


    // console.log(`Updated ${type}: ${value}`);
    broadcastData(); // Notify clients about the data change
    res.send(`Sensor data for ${type} updated to ${value}`);
  } else {
    sensorData = null
    broadcastData();
    res.status(400).send({ error: 'Invalid sensor type' });
  }
});

// Endpoint to control the pump manually from the frontend
app.post('/control-pump', (req, res) => {
  const { state } = req.body;
  const pumpState = state ? 'ON' : 'OFF';

  // Send manual control signal to ESP32
  axios.post(`${espIp}/control-pump`, { state })
    .then(() => {
      sensorData.pumpStatus = pumpState;
      res.send(`Pump is now ${pumpState}`);
    })
    .catch((error) => {
      console.error('Error controlling the pump:', error);
      res.status(500).send('Failed to control the pump');
    });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
