const Comment = require('../Models/comment');

// Add a new comment
const addComment = async (req, res) => {
  try {
    const { professionalId, userId, rating, comment } = req.body;
    
    const newComment = new Comment({
      professionalId,
      userId,
      rating,
      comment
    });

    await newComment.save();
    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get top 5 comments for a professional
const getTopComments = async (req, res) => {
  try {
    const { professionalId } = req.params;
    
    const comments = await Comment.find({ professionalId })
      .sort({ rating: -1 })
      .limit(5)
      .populate('userId', 'firstName lastName');

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all comments for a professional
const getProfessionalComments = async (req, res) => {
  try {
    const { professionalId } = req.params;
    
    const comments = await Comment.find({ professionalId })
      .populate('userId', 'firstName lastName');

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addComment,
  getTopComments,
  getProfessionalComments
};
