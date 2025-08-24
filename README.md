# My Professional Platform

A platform connecting professionals with clients, built with React, Node.js, Express, and MongoDB.

## Features

- User Authentication (Regular Users and Professionals)
- Professional Profile Management
- Service Management
- Appointment Scheduling
- Reviews and Ratings
- City and Category-based Search
- Admin Dashboard

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm (v6 or higher)

## Project Structure

```
my-professional/
├── client/                 # Frontend React application
│   └── my_proffssional/
│       ├── public/
│       └── src/
│           ├── components/
│           ├── services/
│           └── config/
├── server/                 # Backend Node.js application
│   ├── Controllers/
│   ├── Models/
│   ├── Routes/
│   └── middleware/
```

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd my-professional
   ```

2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env` in both client and server directories
   - Update the values according to your environment

4. Start MongoDB:
   ```bash
   # Make sure MongoDB is running on your system
   mongod
   ```

5. Start the development servers:
   ```bash
   npm run dev
   ```

   This will start both the client (port 3000) and server (port 3001) in development mode.

## Available Scripts

- `npm run install:all` - Install dependencies for client and server
- `npm run dev` - Start both client and server in development mode
- `npm run server` - Start only the server
- `npm run client` - Start only the client

## API Documentation

### Authentication Endpoints
- POST `/api/auth/register` - Register a new user
- POST `/api/auth/login` - Login user
- GET `/api/auth/profile` - Get user profile

### Professional Endpoints
- GET `/api/professionals` - Get all professionals
- GET `/api/professionals/:id` - Get professional by ID
- GET `/api/professionals/search` - Search professionals

### Service Endpoints
- GET `/api/services` - Get all services
- POST `/api/services` - Create new service
- PUT `/api/services/:id` - Update service
- DELETE `/api/services/:id` - Delete service

### Review Endpoints
- GET `/api/reviews/professional/:id` - Get reviews for a professional
- POST `/api/reviews` - Create new review
- PUT `/api/reviews/:id` - Update review
- DELETE `/api/reviews/:id` - Delete review

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


