const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { config } = require('../config/config');
const { logger } = require('./logger');
const { emitToUser, emitToProfessional } = require('./socketManager');

// Initialize email transport
const transporter = nodemailer.createTransport(config.email.smtp);

/**
 * Load and compile email template
 */
const loadTemplate = async (templateName) => {
  try {
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.hbs`);
    const template = await fs.readFile(templatePath, 'utf-8');
    return handlebars.compile(template);
  } catch (error) {
    logger.error('Template loading error:', error);
    throw error;
  }
};

/**
 * Send email notification
 */
const sendEmail = async ({ to, subject, template, context }) => {
  try {
    // Load template
    const compiledTemplate = await loadTemplate(template);
    const html = compiledTemplate(context);

    // Load layout template
    const layoutTemplate = await loadTemplate('layout');
    const finalHtml = layoutTemplate({
      content: html,
      year: new Date().getFullYear()
    });

    // Send email
    const result = await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      html: finalHtml
    });

    logger.info('Email sent:', { to, subject, messageId: result.messageId });
    return result;
  } catch (error) {
    logger.error('Email sending error:', error);
    throw error;
  }
};

/**
 * Send push notification
 */
const sendPushNotification = async ({ userId, title, body, data = {} }) => {
  try {
    // Here you would integrate with a push notification service
    // like Firebase Cloud Messaging or OneSignal
    logger.info('Push notification sent:', { userId, title });
  } catch (error) {
    logger.error('Push notification error:', error);
    throw error;
  }
};

/**
 * Send in-app notification
 */
const sendInAppNotification = async ({ userId, type, message, data = {} }) => {
  try {
    // Create notification object
    const notification = {
      userId,
      type,
      message,
      data,
      timestamp: new Date(),
      read: false
    };

    // Save to database
    // await Notification.create(notification);

    // Emit to user via Socket.IO
    emitToUser(userId, 'notification:new', notification);

    logger.info('In-app notification sent:', { userId, type });
    return notification;
  } catch (error) {
    logger.error('In-app notification error:', error);
    throw error;
  }
};

/**
 * Send SMS notification
 */
const sendSMS = async ({ phone, message }) => {
  try {
    // Here you would integrate with an SMS service
    // like Twilio or MessageBird
    logger.info('SMS sent:', { phone });
  } catch (error) {
    logger.error('SMS sending error:', error);
    throw error;
  }
};

/**
 * Notification templates
 */
const templates = {
  // Appointment notifications
  appointmentConfirmation: async (appointment) => {
    const { user, professional, datetime } = appointment;
    
    // Send email to user
    await sendEmail({
      to: user.email,
      subject: 'אישור תור',
      template: 'appointment-confirmation',
      context: { appointment, user, professional }
    });

    // Send in-app notification
    await sendInAppNotification({
      userId: user.id,
      type: 'appointment_confirmation',
      message: `התור שלך עם ${professional.name} אושר`,
      data: { appointmentId: appointment.id }
    });
  },

  appointmentReminder: async (appointment) => {
    const { user, professional, datetime } = appointment;
    
    await Promise.all([
      // Send email
      sendEmail({
        to: user.email,
        subject: 'תזכורת לתור',
        template: 'appointment-reminder',
        context: { appointment, user, professional }
      }),

      // Send SMS
      sendSMS({
        phone: user.phone,
        message: `תזכורת: יש לך תור עם ${professional.name} ב-${datetime}`
      }),

      // Send in-app notification
      sendInAppNotification({
        userId: user.id,
        type: 'appointment_reminder',
        message: `תזכורת: התור שלך עם ${professional.name} מתקרב`,
        data: { appointmentId: appointment.id }
      })
    ]);
  },

  // Comment notifications
  newComment: async (comment) => {
    const { professional, user } = comment;

    await Promise.all([
      // Notify professional
      sendInAppNotification({
        userId: professional.userId,
        type: 'new_comment',
        message: `${user.name} הוסיף תגובה חדשה`,
        data: { commentId: comment.id }
      }),

      // Send email
      sendEmail({
        to: professional.email,
        subject: 'תגובה חדשה',
        template: 'new-comment',
        context: { comment, user }
      })
    ]);
  },

  commentReply: async (reply) => {
    const { parentComment, user } = reply;

    await sendInAppNotification({
      userId: parentComment.userId,
      type: 'comment_reply',
      message: `${user.name} הגיב לתגובה שלך`,
      data: { commentId: reply.id }
    });
  },

  // Review notifications
  newReview: async (review) => {
    const { professional, user } = review;

    await sendInAppNotification({
      userId: professional.userId,
      type: 'new_review',
      message: `${user.name} הוסיף ביקורת חדשה`,
      data: { reviewId: review.id }
    });
  },

  // Chat notifications
  newMessage: async (message) => {
    const { recipientId, sender } = message;

    await sendInAppNotification({
      userId: recipientId,
      type: 'new_message',
      message: `הודעה חדשה מ-${sender.name}`,
      data: { messageId: message.id }
    });
  }
};

module.exports = {
  sendEmail,
  sendPushNotification,
  sendInAppNotification,
  sendSMS,
  templates
};
