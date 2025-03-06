const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  userId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content:
  {
    type: String,
    required: true,
    min: 1
  },
  stars:
  {
    type: Number,
    required: true
  }
});

const Comment = mongoose.model('Comment', CommentSchema)

module.exports = Comment;