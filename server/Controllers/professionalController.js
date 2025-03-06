const Professional = require('../Models/professional');
const User = require('../Models/user');

// Get all professionals with optional filters
const getAllProfessionals = async (req, res) => {
  try {
    const { category, city, minRating, maxPrice, search } = req.query;
    let query = {};

    // Build query based on filters
    if (category) query.category = category;
    if (minRating) query.rating = { $gte: parseFloat(minRating) };
    if (maxPrice) query.hourlyRate = { $lte: parseFloat(maxPrice) };

    // If city filter is provided, join with User model to filter by city
    let professionals;
    if (city || search) {
      professionals = await Professional.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $match: {
            ...(city && { 'user.cityId': city }),
            ...(search && {
              $or: [
                { 'user.firstName': { $regex: search, $options: 'i' } },
                { 'user.lastName': { $regex: search, $options: 'i' } },
                { qualifications: { $regex: search, $options: 'i' } }
              ]
            }),
            ...query
          }
        }
      ]);
    } else {
      professionals = await Professional.find(query)
        .populate('userId', 'firstName lastName email cityId')
        .populate('category')
        .sort('-rating');
    }

    res.status(200).json(professionals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get professional by ID
const getProfessionalById = async (req, res) => {
  try {
    const professional = await Professional.findById(req.params.id)
      .populate('userId', 'firstName lastName email cityId')
      .populate('category')
      .populate('reviews');
    
    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }
    
    res.status(200).json(professional);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add new professional
const addProfessional = async (req, res) => {
  try {
    // Check if user exists and is not already a professional
    const existingProfessional = await Professional.findOne({ userId: req.body.userId });
    if (existingProfessional) {
      return res.status(400).json({ message: 'User is already a professional' });
    }

    const newProfessional = new Professional(req.body);
    await newProfessional.save();

    // Update user status
    await User.findByIdAndUpdate(req.body.userId, { status: 'מקצוען' });

    res.status(201).json(newProfessional);
  } catch (err) {
    res.status(400).json({ message: 'Failed to add professional', error: err.message });
  }
};

// Update professional
const updateProfessional = async (req, res) => {
  try {
    const updatedProfessional = await Professional.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category');

    if (!updatedProfessional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    res.status(200).json(updatedProfessional);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update professional', error: err.message });
  }
};

// Delete professional
const deleteProfessional = async (req, res) => {
  try {
    const professional = await Professional.findById(req.params.id);
    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    // Update user status back to regular user
    await User.findByIdAndUpdate(professional.userId, { status: 'לקוח רגיל' });

    await Professional.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Professional profile deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update availability
const updateAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const professional = await Professional.findById(req.params.id);

    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    professional.availability = availability;
    await professional.save();

    res.status(200).json(professional);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update availability', error: err.message });
  }
};

// Add service
const addService = async (req, res) => {
  try {
    const professional = await Professional.findById(req.params.id);
    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    professional.services.push(req.body);
    await professional.save();

    res.status(201).json(professional);
  } catch (err) {
    res.status(400).json({ message: 'Failed to add service', error: err.message });
  }
};

// Update service
const updateService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const professional = await Professional.findById(req.params.id);

    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    const serviceIndex = professional.services.findIndex(s => s._id.toString() === serviceId);
    if (serviceIndex === -1) {
      return res.status(404).json({ message: 'Service not found' });
    }

    professional.services[serviceIndex] = { ...professional.services[serviceIndex], ...req.body };
    await professional.save();

    res.status(200).json(professional);
  } catch (err) {
    res.status(400).json({ message: 'Failed to update service', error: err.message });
  }
};

// Delete service
const deleteService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const professional = await Professional.findById(req.params.id);

    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    professional.services = professional.services.filter(s => s._id.toString() !== serviceId);
    await professional.save();

    res.status(200).json({ message: 'Service deleted successfully' });
  } catch (err) {
    res.status(400).json({ message: 'Failed to delete service', error: err.message });
  }
};

module.exports = {
  getAllProfessionals,
  getProfessionalById,
  addProfessional,
  updateProfessional,
  deleteProfessional,
  updateAvailability,
  addService,
  updateService,
  deleteService
};
