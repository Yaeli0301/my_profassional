const Category = require('../Models/category');

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.findActive()
      .populate('professionalCount');
    res.json(categories);
  } catch (error) {
    console.error('Error in getAllCategories:', error);
    res.status(500).json({ message: 'שגיאה בטעינת הקטגוריות' });
  }
};

// Get category by ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('professionalCount');
    
    if (!category) {
      return res.status(404).json({ message: 'קטגוריה לא נמצאה' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error in getCategoryById:', error);
    res.status(500).json({ message: 'שגיאה בטעינת הקטגוריה' });
  }
};

// Get category by slug
exports.getCategoryBySlug = async (req, res) => {
  try {
    const category = await Category.findBySlug(req.params.slug)
      .populate('professionalCount');
    
    if (!category) {
      return res.status(404).json({ message: 'קטגוריה לא נמצאה' });
    }

    res.json(category);
  } catch (error) {
    console.error('Error in getCategoryBySlug:', error);
    res.status(500).json({ message: 'שגיאה בטעינת הקטגוריה' });
  }
};

// Search categories
exports.searchCategories = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const categories = await Category.searchCategories(q);
    res.json(categories);
  } catch (error) {
    console.error('Error in searchCategories:', error);
    res.status(500).json({ message: 'שגיאה בחיפוש קטגוריות' });
  }
};

// Admin Routes

// Create category
exports.createCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      subcategories,
      parentCategory,
      order,
      metadata
    } = req.body;

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ message: 'קטגוריה בשם זה כבר קיימת' });
    }

    const category = new Category({
      name,
      description,
      icon,
      subcategories,
      parentCategory,
      order,
      metadata,
      searchTerms: [name, description, ...(subcategories || [])].join(' ')
    });

    await category.save();
    res.status(201).json(category);
  } catch (error) {
    console.error('Error in createCategory:', error);
    res.status(500).json({ message: 'שגיאה ביצירת הקטגוריה' });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      subcategories,
      parentCategory,
      order,
      isActive,
      metadata
    } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'קטגוריה לא נמצאה' });
    }

    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ name });
      if (existingCategory) {
        return res.status(400).json({ message: 'קטגוריה בשם זה כבר קיימת' });
      }
      category.name = name;
    }

    if (description) category.description = description;
    if (icon) category.icon = icon;
    if (subcategories) category.subcategories = subcategories;
    if (parentCategory) category.parentCategory = parentCategory;
    if (typeof order === 'number') category.order = order;
    if (typeof isActive === 'boolean') category.isActive = isActive;
    if (metadata) category.metadata = { ...category.metadata, ...metadata };

    category.searchTerms = [
      category.name,
      category.description,
      ...(category.subcategories || [])
    ].join(' ');

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Error in updateCategory:', error);
    res.status(500).json({ message: 'שגיאה בעדכון הקטגוריה' });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'קטגוריה לא נמצאה' });
    }

    // Check if category has professionals
    const professionalCount = await category.professionalCount;
    if (professionalCount > 0) {
      return res.status(400).json({
        message: 'לא ניתן למחוק קטגוריה שיש בה מקצוענים פעילים'
      });
    }

    await category.deleteOne();
    res.json({ message: 'הקטגוריה נמחקה בהצלחה' });
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    res.status(500).json({ message: 'שגיאה במחיקת הקטגוריה' });
  }
};

// Reorder categories
exports.reorderCategories = async (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) {
      return res.status(400).json({ message: 'נדרש מערך של סדר קטגוריות' });
    }

    await Promise.all(
      orders.map(({ id, order }) =>
        Category.findByIdAndUpdate(id, { order })
      )
    );

    res.json({ message: 'סדר הקטגוריות עודכן בהצלחה' });
  } catch (error) {
    console.error('Error in reorderCategories:', error);
    res.status(500).json({ message: 'שגיאה בעדכון סדר הקטגוריות' });
  }
};

// Get category statistics
exports.getCategoryStats = async (req, res) => {
  try {
    const stats = await Category.aggregate([
      {
        $lookup: {
          from: 'professionals',
          localField: '_id',
          foreignField: 'categoryId',
          as: 'professionals'
        }
      },
      {
        $project: {
          name: 1,
          totalProfessionals: { $size: '$professionals' },
          activeProfessionals: {
            $size: {
              $filter: {
                input: '$professionals',
                as: 'pro',
                cond: { $eq: ['$$pro.isActive', true] }
              }
            }
          }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Error in getCategoryStats:', error);
    res.status(500).json({ message: 'שגיאה בטעינת סטטיסטיקות הקטגוריות' });
  }
};
