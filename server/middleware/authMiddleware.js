const jwt = require('jsonwebtoken');

// Authentication middleware
const auth = (req, res, next) => {
    console.log("Auth middleware called"); // Added log for debugging
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        console.log("Token received:", token); // Added log for debugging

        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error("Token verification error:", err); // Added log for debugging
        res.status(401).json({ message: 'Token is not valid' });
    }
}

// Status-based authorization middleware
const authorize = (status) => {
    return (req, res, next) => {
        if (req.user.status !== status) {
            return res.status(403).json({ 
                message: `Access denied. Requires ${status} status` 
            });
        }
        next();
    }
}

module.exports = { auth, authorize };
