const City = require('../Models/city');

// Get all cities
exports.getAllCities = async (req, res) => {
  try {
    const cities = await City.find()
      .sort('name')
      .select('name district');
    res.json(cities);
  } catch (error) {
    console.error('Error in getAllCities:', error);
    res.status(500).json({ message: 'שגיאה בטעינת רשימת הערים' });
  }
};

// Get cities by district
exports.getCitiesByDistrict = async (req, res) => {
  try {
    const { district } = req.params;
    const cities = await City.findByDistrict(district);
    res.json(cities);
  } catch (error) {
    console.error('Error in getCitiesByDistrict:', error);
    res.status(500).json({ message: 'שגיאה בטעינת ערי המחוז' });
  }
};

// Search cities
exports.searchCities = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const cities = await City.searchByName(q);
    res.json(cities);
  } catch (error) {
    console.error('Error in searchCities:', error);
    res.status(500).json({ message: 'שגיאה בחיפוש ערים' });
  }
};

// Get nearby cities
exports.getNearbyCities = async (req, res) => {
  try {
    const { lat, lng, distance } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ message: 'נדרשים קווי אורך ורוחב' });
    }

    const coordinates = [parseFloat(lng), parseFloat(lat)];
    const maxDistance = distance ? parseInt(distance) : 10000; // Default 10km

    const cities = await City.findNearby(coordinates, maxDistance);
    res.json(cities);
  } catch (error) {
    console.error('Error in getNearbyCities:', error);
    res.status(500).json({ message: 'שגיאה בחיפוש ערים קרובות' });
  }
};

// Get city by ID
exports.getCityById = async (req, res) => {
  try {
    const { id } = req.params;
    const city = await City.findById(id);
    
    if (!city) {
      return res.status(404).json({ message: 'עיר לא נמצאה' });
    }

    res.json(city);
  } catch (error) {
    console.error('Error in getCityById:', error);
    res.status(500).json({ message: 'שגיאה בטעינת פרטי העיר' });
  }
};

// Admin Routes

// Create new city (admin only)
exports.createCity = async (req, res) => {
  try {
    const { name, district, coordinates } = req.body;

    const existingCity = await City.findOne({ name });
    if (existingCity) {
      return res.status(400).json({ message: 'עיר זו כבר קיימת במערכת' });
    }

    const city = new City({
      name,
      district,
      location: {
        type: 'Point',
        coordinates
      }
    });

    await city.save();
    res.status(201).json(city);
  } catch (error) {
    console.error('Error in createCity:', error);
    res.status(500).json({ message: 'שגיאה ביצירת עיר חדשה' });
  }
};

// Update city (admin only)
exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, district, coordinates, isActive } = req.body;

    const city = await City.findById(id);
    if (!city) {
      return res.status(404).json({ message: 'עיר לא נמצאה' });
    }

    if (name && name !== city.name) {
      const existingCity = await City.findOne({ name });
      if (existingCity) {
        return res.status(400).json({ message: 'שם העיר כבר קיים במערכת' });
      }
      city.name = name;
    }

    if (district) city.district = district;
    if (coordinates) {
      city.location = {
        type: 'Point',
        coordinates
      };
    }
    if (typeof isActive === 'boolean') city.isActive = isActive;

    await city.save();
    res.json(city);
  } catch (error) {
    console.error('Error in updateCity:', error);
    res.status(500).json({ message: 'שגיאה בעדכון פרטי העיר' });
  }
};

// Delete city (admin only)
exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    const city = await City.findById(id);
    
    if (!city) {
      return res.status(404).json({ message: 'עיר לא נמצאה' });
    }

    await city.deleteOne();
    res.json({ message: 'העיר נמחקה בהצלחה' });
  } catch (error) {
    console.error('Error in deleteCity:', error);
    res.status(500).json({ message: 'שגיאה במחיקת העיר' });
  }
};

// Get districts
exports.getDistricts = async (req, res) => {
  try {
    const districts = await City.distinct('district');
    res.json(districts);
  } catch (error) {
    console.error('Error in getDistricts:', error);
    res.status(500).json({ message: 'שגיאה בטעינת רשימת המחוזות' });
  }
};
