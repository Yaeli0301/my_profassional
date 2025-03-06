const express = require('express');
const router = express.Router();
const Category = require('../Models/category');

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ active: true })
      .populate('subcategories')
      .sort('name');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching categories', error: err.message });
  }
});

// Get category by ID
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('subcategories');
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching category', error: err.message });
  }
});

// Get subcategories of a category
router.get('/:id/subcategories', async (req, res) => {
  try {
    const subcategories = await Category.find({ 
      parentCategory: req.params.id,
      active: true 
    }).sort('name');
    res.json(subcategories);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching subcategories', error: err.message });
  }
});

module.exports = router;
