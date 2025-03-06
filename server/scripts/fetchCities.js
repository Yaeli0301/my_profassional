const mongoose = require('mongoose');
const City = require('../Models/city');

const fetchCities = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/my_professional', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const cities = await City.find();
    console.log('Cities:', cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
  } finally {
    mongoose.connection.close();
  }
};

fetchCities();
