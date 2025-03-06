const City = require('../Models/city');

// פוקנציה לקבל את כל הערים
const getAllCities = async (req, res) => {
  try {
    const cities = await City.find();
    res.json(cities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// פוקנציה לקבל עיר לפי מזהה
const getCityById = async (req, res) => {
  try {
    const city = await City.findById(req.params.id);
    if (!city) {
      return res.status(404).json({ message: 'City not found' });
    }
    res.json(city);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// פוקנציה להוסיף עיר
const addCity = async (req, res) => {
  const { cityName } = req.body;
  console.log('city name ',cityName);
  
  const newCity = new City({ cityName });

  try {
    await newCity.save();
    res.status(201).json(newCity);
  } catch (err) {
    res.status(400).json({ message: 'Failed to add city. Please check the input.' });
  }
};

// פוקנציה לעדכן עיר
const updateCity = async (req, res) => {
  try {
    const updatedCity = await City.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedCity) {
      return res.status(404).json({ message: 'City not found' });
    }
    res.json(updatedCity);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update city. Please check the input.' });
  }
};

// פוקנציה למחוק עיר
const deleteCity = async (req, res) => {
  try {
    const deletedCity = await City.findByIdAndDelete(req.params.id);
    if (!deletedCity) {
      return res.status(404).json({ message: 'City not found' });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllCities,
  getCityById,
  addCity,
  updateCity,
  deleteCity
};
