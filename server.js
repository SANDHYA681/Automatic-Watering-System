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
// Placeholder data for the irrigation system
let sensorData = {
  moisture: '--',
  temperature: '--',
  humidity: '--',
  pumpStatus: 'OFF', // Manual control status
  autoPump: 'OFF',   // Arduino-controlled pump status
};
// WebSocket server setup
const wss = new WebSocket.Server({ port: 8081 });

// Store connected clients
wss.on('connection', (ws) => {
  console.log("New WebSocket client connected");

  // Send current sensor data immediately on new connection
  ws.send(JSON.stringify(sensorData));

  ws.on('close', () => {
    console.log("WebSocket client disconnected");
  });
});



// Broadcast function to send data to all connected clients
const broadcastData = () => {
  const data = JSON.stringify(sensorData);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// Serve the frontend to display data and control the system
app.get('/', (req, res) => {
  res.render('index', { sensorData });
});

// Endpoint to receive data from the Arduino/ESP32
app.get('/sensor-data', (req, res) => {
  const { type, value } = req.query;
  console.log(`Received sensor update: ${type} = ${value}`);

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

  if (parsedValue === -1) {
    return res.status(400).send({ message: "value is -1" });
  }

  if (type in sensorData) {
    sensorData[type] = type === 'autoPump' ? (value === 'ON' ? 'ON' : 'OFF') : parsedValue;

    broadcastData(); // Notify all connected clients
    return res.send(`Sensor data for ${type} updated to ${value}`);
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

  axios.post(`${espIp}/control-pump`, { state })
    .then(() => {
      sensorData.pumpStatus = pumpState;
      broadcastData(); // Notify clients about pump state change
      res.send(`Pump is now ${pumpState}`);
    })
    .catch((error) => {
      console.error('Error controlling the pump:', error);
      res.status(500).send('Failed to control the pump');
    });
});

// Fetch sensor data periodically from ESP32 (optional)
const fetchSensorData = async () => {
  try {
    const response = await axios.get(`${espIp}/get-sensor-data`);
    if (response.data) {
      sensorData = response.data;
      broadcastData(); // Send updated data to all clients
    }
  } catch (error) {
    console.error("Error fetching sensor data:", error.message);
  }
};

// Uncomment this if you want periodic updates (e.g., every 5 seconds)
// setInterval(fetchSensorData, 5000);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
