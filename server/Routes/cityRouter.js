const express = require('express');
const router = express.Router();
const City = require('../Models/city');
const cityController = require('../Controllers/cityController');

router.post('/',cityController.addCity);

// Get all cities
router.get('/', async (req, res) => {
  try {
    const cities = await City.find().sort('name');
    res.json(cities);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching cities', error: err.message });
  }
});

// Get city by ID
router.get('/:id', async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ message: 'City not found' });
    }
    res.json(city);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching city', error: err.message });
  }
});

module.exports = router;
