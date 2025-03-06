const Service = require('../Models/service');
const Professional = require('../Models/professional');

// Get all services for a professional
const getProfessionalServices = async (req, res) => {
  try {
    const { professionalId } = req.params;
    
    const services = await Service.find({ professionalId })
      .sort({ createdAt: -1 });

    res.status(200).json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ 
      message: 'Error fetching services', 
      error: error.message 
    });
  }
};

// Create a new service
const createService = async (req, res) => {
  try {
    const { professionalId } = req.params;
    
    // Verify professional exists and user has permission
    const professional = await Professional.findById(professionalId);
    if (!professional) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    // Verify user owns this professional profile
    if (professional.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to add services for this professional' });
    }

    // Validate required fields
    const { name, price, duration } = req.body;
    if (!name || !price || !duration) {
      return res.status(400).json({ message: 'Name, price, and duration are required' });
    }

    const service = new Service({
      professionalId,
      ...req.body
    });

    await service.save();

    res.status(201).json(service);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ 
      message: 'Error creating service', 
      error: error.message 
    });
  }
};

// Update a service
const updateService = async (req, res) => {
  try {
    const { professionalId, serviceId } = req.params;

    // Verify service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Verify service belongs to the professional
    if (service.professionalId.toString() !== professionalId) {
      return res.status(404).json({ message: 'Service not found for this professional' });
    }

    // Verify professional exists and user has permission
    const professional = await Professional.findById(professionalId);
    if (!professional || professional.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this service' });
    }

    // Update service
    const updatedService = await Service.findByIdAndUpdate(
      serviceId,
      { ...req.body },
      { new: true, runValidators: true }
    );

    res.status(200).json(updatedService);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ 
      message: 'Error updating service', 
      error: error.message 
    });
  }
};

// Delete a service
const deleteService = async (req, res) => {
  try {
    const { professionalId, serviceId } = req.params;

    // Verify service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Verify service belongs to the professional
    if (service.professionalId.toString() !== professionalId) {
      return res.status(404).json({ message: 'Service not found for this professional' });
    }

    // Verify professional exists and user has permission
    const professional = await Professional.findById(professionalId);
    if (!professional || professional.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this service' });
    }

    // Check if service has any upcoming appointments
    const hasAppointments = await service.populate('appointments');
    if (hasAppointments.appointments.length > 0) {
      const upcomingAppointments = hasAppointments.appointments.some(apt => 
        new Date(apt.startTime) > new Date()
      );

      if (upcomingAppointments) {
        return res.status(400).json({ 
          message: 'Cannot delete service with upcoming appointments' 
        });
      }
    }

    await service.remove();

    res.status(200).json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ 
      message: 'Error deleting service', 
      error: error.message 
    });
  }
};

// Get a single service
const getService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.status(200).json(service);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ 
      message: 'Error fetching service', 
      error: error.message 
    });
  }
};

// Toggle service availability
const toggleAvailability = async (req, res) => {
  try {
    const { professionalId, serviceId } = req.params;

    // Verify service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // Verify service belongs to the professional
    if (service.professionalId.toString() !== professionalId) {
      return res.status(404).json({ message: 'Service not found for this professional' });
    }

    // Verify professional exists and user has permission
    const professional = await Professional.findById(professionalId);
    if (!professional || professional.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this service' });
    }

    service.isAvailable = !service.isAvailable;
    await service.save();

    res.status(200).json(service);
  } catch (error) {
    console.error('Error toggling service availability:', error);
    res.status(500).json({ 
      message: 'Error toggling service availability', 
      error: error.message 
    });
  }
};

module.exports = {
  getProfessionalServices,
  createService,
  updateService,
  deleteService,
  getService,
  toggleAvailability
};
