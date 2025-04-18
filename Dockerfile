FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose port (use ARG for build-time variable)
ARG PORT=3001
EXPOSE ${PORT}

# Start the application
CMD ["npm", "start"]