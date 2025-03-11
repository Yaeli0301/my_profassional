const Comment = require('../Models/comment');
const User = require('../Models/user');
const Professional = require('../Models/professional');
const { sendNotification } = require('../utils/notifications');
const mongoose = require('mongoose');

// Helper function to check if user can modify comment
const canModifyComment = (user, comment) => {
  return user.role === 'admin' || comment.user.equals(user._id);
};

exports.createComment = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const { content, rating } = req.body;

    // Check if professional exists
    const professional = await Professional.findById(professionalId);
    if (!professional) {
      return res.status(404).json({ message: 'המקצוען לא נמצא' });
    }

    // Check if user already commented
    const existingComment = await Comment.findOne({
      professional: professionalId,
      user: req.user._id
    });

    if (existingComment) {
      return res.status(400).json({ message: 'כבר כתבת תגובה למקצוען זה' });
    }

    const comment = new Comment({
      professional: professionalId,
      user: req.user._id,
      content,
      rating
    });

    await comment.save();

    // Send notification to professional
    await sendNotification({
      type: 'newComment',
      recipient: professional,
      commentAuthor: req.user,
      professional,
      commentId: comment._id
    });

    // Populate user details
    await comment.populate('user', 'firstName lastName profilePicture');

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ message: 'אירעה שגיאה ביצירת התגובה' });
  }
};

exports.getCommentsByProfessional = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      Comment.find({ professional: professionalId, isBlocked: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'firstName lastName profilePicture'),
      Comment.countDocuments({ professional: professionalId, isBlocked: false })
    ]);

    res.json({
      comments,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({ message: 'אירעה שגיאה בטעינת התגובות' });
  }
};

exports.updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, rating } = req.body;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'התגובה לא נמצאה' });
    }

    if (!canModifyComment(req.user, comment)) {
      return res.status(403).json({ message: 'אין לך הרשאה לערוך תגובה זו' });
    }

    comment.content = content;
    if (rating) comment.rating = rating;
    comment.updatedAt = Date.now();

    await comment.save();
    await comment.populate('user', 'firstName lastName profilePicture');

    res.json(comment);
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ message: 'אירעה שגיאה בעדכון התגובה' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'התגובה לא נמצאה' });
    }

    if (!canModifyComment(req.user, comment)) {
      return res.status(403).json({ message: 'אין לך הרשאה למחוק תגובה זו' });
    }

    await comment.deleteOne();
    res.json({ message: 'התגובה נמחקה בהצלחה' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ message: 'אירעה שגיאה במחיקת התגובה' });
  }
};

exports.reportComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'התגובה לא נמצאה' });
    }

    // Check if user already reported
    if (comment.reports.some(report => report.user.equals(req.user._id))) {
      return res.status(400).json({ message: 'כבר דיווחת על תגובה זו' });
    }

    comment.reports.push({
      user: req.user._id,
      reason,
      date: new Date()
    });

    await comment.save();

    // Notify admins if report threshold reached
    if (comment.reports.length >= 3) {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await sendNotification({
          type: 'reportedComment',
          recipient: admin,
          comment,
          reportCount: comment.reports.length
        });
      }
    }

    res.json({ message: 'הדיווח התקבל בהצלחה' });
  } catch (error) {
    console.error('Error reporting comment:', error);
    res.status(500).json({ message: 'אירעה שגיאה בדיווח על התגובה' });
  }
};

exports.toggleFeedback = async (req, res) => {
  try {
    const { id, action } = req.params;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'התגובה לא נמצאה' });
    }

    const userId = req.user._id;
    const isLike = action === 'like';

    // Remove existing feedback if any
    comment.likes = comment.likes.filter(like => !like.equals(userId));
    comment.dislikes = comment.dislikes.filter(dislike => !dislike.equals(userId));

    // Add new feedback unless it's being removed
    if (req.method !== 'DELETE') {
      if (isLike) {
        comment.likes.push(userId);
      } else {
        comment.dislikes.push(userId);
      }
    }

    await comment.save();
    res.json({
      likes: comment.likes.length,
      dislikes: comment.dislikes.length,
      userFeedback: req.method === 'DELETE' ? null : action
    });
  } catch (error) {
    console.error('Error toggling feedback:', error);
    res.status(500).json({ message: 'אירעה שגיאה בעדכון המשוב' });
  }
};

exports.moderateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;

    const comment = await Comment.findById(id)
      .populate('user', 'firstName lastName email')
      .populate('professional', 'name');

    if (!comment) {
      return res.status(404).json({ message: 'התגובה לא נמצאה' });
    }

    comment.moderation = {
      status: action,
      moderatedBy: req.user._id,
      moderatedAt: new Date(),
      note
    };

    if (action === 'reject') {
      comment.isBlocked = true;
    }

    await comment.save();

    // Notify user
    await sendNotification({
      type: 'commentModeration',
      recipient: comment.user,
      action,
      note,
      professionalName: comment.professional.name,
      commentId: comment._id
    });

    res.json({ message: 'התגובה טופלה בהצלחה' });
  } catch (error) {
    console.error('Error moderating comment:', error);
    res.status(500).json({ message: 'אירעה שגיאה בטיפול בתגובה' });
  }
};

exports.getCommentStats = async (req, res) => {
  try {
    const stats = await Comment.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          reported: [
            { $match: { 'reports.0': { $exists: true } } },
            { $count: 'count' }
          ],
          blocked: [
            { $match: { isBlocked: true } },
            { $count: 'count' }
          ],
          ratings: [
            { $match: { rating: { $exists: true } } },
            {
              $group: {
                _id: null,
                avgRating: { $avg: '$rating' },
                totalRatings: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    res.json({
      total: stats[0].total[0]?.count || 0,
      reported: stats[0].reported[0]?.count || 0,
      blocked: stats[0].blocked[0]?.count || 0,
      ratings: stats[0].ratings[0] || { avgRating: 0, totalRatings: 0 }
    });
  } catch (error) {
    console.error('Error getting comment stats:', error);
    res.status(500).json({ message: 'אירעה שגיאה בטעינת הסטטיסטיקות' });
  }
};
