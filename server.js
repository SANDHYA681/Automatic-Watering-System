// Import required modules
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const axios = require('axios');
const WebSocket = require('ws');

// Initialize the application
const app = express();
const PORT = 5000;
const espIp = "http://192.168.1.4:8080"; // Update with the actual ESP32 IP

// Middleware
app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8081 });

// Store connected clients
const clients = new Set();

// Broadcast function to send data to all connected clients
const broadcastData = () => {
  const data = JSON.stringify(sensorData);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// WebSocket Connection Handling
wss.on('connection', (ws) => {
  console.log('New client connected');
  clients.add(ws);

  // Send current sensor data immediately on connection
  ws.send(JSON.stringify(sensorData));

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket Error:', error);
  });
});

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

// Endpoint to receive sensor data from the ESP32
app.get('/sensor-data', (req, res) => {
  const { type, value } = req.query;
  console.log(`Updated ${type}: ${value}`);

  // Validate input
  if (!type || value === undefined) {
    return res.status(400).send({ error: 'Missing type or value in query parameters' });
  }

  const parsedValue = Number.parseFloat(value);

  // If value is -1, ignore it or set to null
  if (parsedValue === -1) {
    return res.status(400).send({ message: "Value is -1, ignoring update" });
  }

  // Update sensor data if valid type
  if (type in sensorData) {
    sensorData[type] = type === 'autoPump' ? (value === 'ON' ? 'ON' : 'OFF') : parsedValue;
    broadcastData(); // Notify all connected clients
    res.send(`Sensor data for ${type} updated to ${value}`);
  } else {
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
      broadcastData();
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
