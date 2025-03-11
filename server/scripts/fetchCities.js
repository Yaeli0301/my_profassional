const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Israeli cities data in Hebrew
const israeliCities = [
  { name: 'תל אביב-יפו', district: 'תל אביב' },
  { name: 'ירושלים', district: 'ירושלים' },
  { name: 'חיפה', district: 'חיפה' },
  { name: 'ראשון לציון', district: 'מרכז' },
  { name: 'פתח תקווה', district: 'מרכז' },
  { name: 'אשדוד', district: 'דרום' },
  { name: 'נתניה', district: 'מרכז' },
  { name: 'באר שבע', district: 'דרום' },
  { name: 'חולון', district: 'תל אביב' },
  { name: 'בני ברק', district: 'תל אביב' },
  { name: 'רמת גן', district: 'תל אביב' },
  { name: 'אשקלון', district: 'דרום' },
  { name: 'רחובות', district: 'מרכז' },
  { name: 'בת ים', district: 'תל אביב' },
  { name: 'בית שמש', district: 'ירושלים' },
  { name: 'כפר סבא', district: 'מרכז' },
  { name: 'הרצליה', district: 'תל אביב' },
  { name: 'חדרה', district: 'חיפה' },
  { name: 'מודיעין', district: 'מרכז' },
  { name: 'נצרת', district: 'צפון' },
  { name: 'רמלה', district: 'מרכז' },
  { name: 'לוד', district: 'מרכז' },
  { name: 'רעננה', district: 'מרכז' },
  { name: 'מכבים-רעות', district: 'מרכז' },
  { name: 'רהט', district: 'דרום' },
  { name: 'הוד השרון', district: 'מרכז' },
  { name: 'קריית גת', district: 'דרום' },
  { name: 'אום אל-פחם', district: 'חיפה' },
  { name: 'אילת', district: 'דרום' },
  { name: 'נהריה', district: 'צפון' },
  { name: 'עפולה', district: 'צפון' },
  { name: 'כרמיאל', district: 'צפון' },
  { name: 'רמת השרון', district: 'תל אביב' },
  { name: 'טבריה', district: 'צפון' },
  { name: 'צפת', district: 'צפון' },
  { name: 'קריית מוצקין', district: 'חיפה' },
  { name: 'קריית ים', district: 'חיפה' },
  { name: 'קריית ביאליק', district: 'חיפה' },
  { name: 'קריית אתא', district: 'חיפה' },
  { name: 'עכו', district: 'צפון' },
  { name: 'גבעתיים', district: 'תל אביב' },
  { name: 'ראש העין', district: 'מרכז' },
  { name: 'יבנה', district: 'מרכז' },
  { name: 'טירה', district: 'מרכז' },
  { name: 'מעלה אדומים', district: 'יהודה ושומרון' },
  { name: 'טייבה', district: 'מרכז' },
  { name: 'נס ציונה', district: 'מרכז' },
  { name: 'אריאל', district: 'יהודה ושומרון' },
  { name: 'קריית אונו', district: 'תל אביב' },
  { name: 'דימונה', district: 'דרום' }
];

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// City model
const City = require('../Models/city');

// Function to populate cities
async function populateCities() {
  try {
    // Clear existing cities
    await City.deleteMany({});
    console.log('Cleared existing cities');

    // Add coordinates to cities using geocoding API
    const citiesWithCoordinates = await Promise.all(
      israeliCities.map(async (city) => {
        try {
          // You can integrate with a geocoding service here if needed
          // For now, we'll use placeholder coordinates
          return {
            name: city.name,
            district: city.district,
            location: {
              type: 'Point',
              coordinates: [0, 0] // Replace with actual coordinates if needed
            }
          };
        } catch (error) {
          console.error(`Error getting coordinates for ${city.name}:`, error);
          return null;
        }
      })
    );

    // Filter out any null values and insert cities
    const validCities = citiesWithCoordinates.filter(city => city !== null);
    await City.insertMany(validCities);

    console.log(`Successfully populated ${validCities.length} cities`);
    
    // Create text index for search
    await City.collection.createIndex({ name: 'text' });
    console.log('Created text index for city names');

    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error populating cities:', error);
    mongoose.disconnect();
    process.exit(1);
  }
}

// Run the population script
populateCities();
