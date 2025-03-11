const { google } = require('googleapis');
const moment = require('moment');
const Appointment = require('../Models/appointment');
const Professional = require('../Models/professional');
const Service = require('../Models/service');
const User = require('../Models/user');
const { sendEmail, sendSMS } = require('../utils/notifications');

// Google Calendar setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const appointmentController = {
  // Create new appointment
  create: async (req, res) => {
    try {
      const { professionalId, serviceId, startTime, notes } = req.body;
      const clientId = req.user._id;

      // Validate professional and service
      const [professional, service] = await Promise.all([
        Professional.findById(professionalId),
        Service.findById(serviceId)
      ]);

      if (!professional || !service) {
        return res.status(404).json({ message: 'Professional or service not found' });
      }

      // Check if timeslot is available
      const endTime = moment(startTime).add(service.duration, 'minutes').toDate();
      const overlapping = await Appointment.findOverlapping(professionalId, startTime, endTime);

      if (overlapping.length > 0) {
        return res.status(400).json({ message: 'Time slot is not available' });
      }

      // Create appointment
      const appointment = new Appointment({
        professional: professionalId,
        client: clientId,
        service: serviceId,
        startTime,
        notes,
        reminders: [
          { type: 'email', minutesBefore: 1440 }, // 24 hours
          { type: 'sms', minutesBefore: 120 }     // 2 hours
        ]
      });

      await appointment.save();

      // Send notifications
      await Promise.all([
        sendEmail({
          to: req.user.email,
          subject: 'אישור קביעת תור',
          template: 'appointment-confirmation',
          data: {
            appointmentId: appointment._id,
            professionalName: `${professional.user.firstName} ${professional.user.lastName}`,
            serviceName: service.name,
            dateTime: moment(startTime).format('DD/MM/YYYY HH:mm')
          }
        }),
        sendEmail({
          to: professional.user.email,
          subject: 'תור חדש נקבע',
          template: 'new-appointment-notification',
          data: {
            appointmentId: appointment._id,
            clientName: `${req.user.firstName} ${req.user.lastName}`,
            serviceName: service.name,
            dateTime: moment(startTime).format('DD/MM/YYYY HH:mm')
          }
        })
      ]);

      res.status(201).json(appointment);
    } catch (error) {
      console.error('Appointment creation error:', error);
      res.status(500).json({ message: 'Failed to create appointment' });
    }
  },

  // Sync with Google Calendar
  syncWithGoogle: async (req, res) => {
    try {
      const { appointmentId } = req.params;
      const appointment = await Appointment.findById(appointmentId)
        .populate('professional')
        .populate('client')
        .populate('service');

      if (!appointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }

      // Check if user has Google Calendar connected
      const user = await User.findById(req.user._id);
      if (!user.googleToken) {
        return res.status(400).json({ message: 'Google Calendar not connected' });
      }

      oauth2Client.setCredentials(user.googleToken);

      // Create event in Google Calendar
      const event = {
        summary: `תור עם ${appointment.professional.user.firstName} ${appointment.professional.user.lastName}`,
        description: `שירות: ${appointment.service.name}\nהערות: ${appointment.notes || ''}`,
        start: {
          dateTime: appointment.startTime.toISOString(),
          timeZone: 'Asia/Jerusalem',
        },
        end: {
          dateTime: appointment.endTime.toISOString(),
          timeZone: 'Asia/Jerusalem',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 }, // 24 hours
            { method: 'popup', minutes: 120 }   // 2 hours
          ],
        },
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });

      appointment.googleEventId = response.data.id;
      await appointment.save();

      res.json({ message: 'Successfully synced with Google Calendar' });
    } catch (error) {
      console.error('Google Calendar sync error:', error);
      res.status(500).json({ message: 'Failed to sync with Google Calendar' });
    }
  },

  // Update appointment status
  updateStatus: async (req, res) => {
    try {
      const { appointmentId } = req.params;
      const { status, notes } = req.body;

      const appointment = await Appointment.findById(appointmentId)
        .populate('professional')
        .populate('client')
        .populate('service');

      if (!appointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }

      // Check permissions
      const isProfessional = appointment.professional._id.equals(req.user._id);
      const isClient = appointment.client._id.equals(req.user._id);

      if (!isProfessional && !isClient) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Validate status change
      if (status === 'cancelled' && !appointment.canCancel()) {
        return res.status(400).json({ message: 'Cannot cancel appointment' });
      }

      appointment.status = status;
      if (notes) appointment.notes = notes;

      await appointment.save();

      // Update Google Calendar if event exists
      if (appointment.googleEventId) {
        try {
          if (status === 'cancelled') {
            await calendar.events.delete({
              calendarId: 'primary',
              eventId: appointment.googleEventId,
            });
          } else {
            await calendar.events.patch({
              calendarId: 'primary',
              eventId: appointment.googleEventId,
              resource: {
                status: status === 'confirmed' ? 'confirmed' : 'tentative'
              },
            });
          }
        } catch (error) {
          console.error('Google Calendar update error:', error);
        }
      }

      // Send notifications
      const notificationPromises = [];
      if (status === 'confirmed') {
        notificationPromises.push(
          sendEmail({
            to: appointment.client.email,
            subject: 'התור שלך אושר',
            template: 'appointment-confirmed',
            data: {
              appointmentId: appointment._id,
              professionalName: `${appointment.professional.user.firstName} ${appointment.professional.user.lastName}`,
              serviceName: appointment.service.name,
              dateTime: moment(appointment.startTime).format('DD/MM/YYYY HH:mm')
            }
          })
        );
      } else if (status === 'cancelled') {
        notificationPromises.push(
          sendEmail({
            to: isProfessional ? appointment.client.email : appointment.professional.user.email,
            subject: 'התור בוטל',
            template: 'appointment-cancelled',
            data: {
              appointmentId: appointment._id,
              canceller: isProfessional ? 'המקצוען' : 'הלקוח',
              dateTime: moment(appointment.startTime).format('DD/MM/YYYY HH:mm')
            }
          })
        );
      }

      await Promise.all(notificationPromises);

      res.json(appointment);
    } catch (error) {
      console.error('Appointment update error:', error);
      res.status(500).json({ message: 'Failed to update appointment' });
    }
  },

  // Get upcoming appointments
  getUpcoming: async (req, res) => {
    try {
      const userType = req.user.status === 'מקצוען' ? 'professional' : 'client';
      const appointments = await Appointment.findUpcoming(req.user._id, userType);
      res.json(appointments);
    } catch (error) {
      console.error('Get upcoming appointments error:', error);
      res.status(500).json({ message: 'Failed to fetch appointments' });
    }
  },

  // Get professional's calendar
  getProfessionalCalendar: async (req, res) => {
    try {
      const { professionalId } = req.params;
      const { start, end } = req.query;

      const appointments = await Appointment.find({
        professional: professionalId,
        status: { $ne: 'cancelled' },
        startTime: { $gte: new Date(start), $lte: new Date(end) }
      }).populate('client').populate('service');

      res.json(appointments);
    } catch (error) {
      console.error('Get calendar error:', error);
      res.status(500).json({ message: 'Failed to fetch calendar' });
    }
  }
};

module.exports = appointmentController;
