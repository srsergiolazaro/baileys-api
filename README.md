# Baileys API

**Baileys API** is a robust and easy-to-use REST API wrapper for the [Baileys](https://github.com/WhiskeySockets/Baileys) library. Built with **TypeScript**, **Express**, and **Prisma**, it enables you to interact with WhatsApp programmatically. It supports multiple sessions, Server-Sent Events (SSE) for QR code updates, and includes a comprehensive Swagger documentation interface.

This project is a continuation and enhancement of [@ookamiiixd/baileys-api](https://github.com/ookamiiixd/baileys-api/).

## 🚀 Features

- **Multi-Session Support**: Manage multiple WhatsApp accounts simultaneously.
- **RESTful API**: Clean and standard API endpoints for all operations.
- **Server-Sent Events (SSE)**: Real-time updates for authentication (QR codes).
- **Database Integration**: Uses Prisma ORM with support for MySQL and PostgreSQL to persist session data.
- **Swagger Documentation**: Built-in interactive API documentation for testing and exploration.
- **Docker Ready**: Includes Dockerfile and ecosystem configuration for easy containerization and deployment.
- **Group Management**: Create, update, and manage WhatsApp groups.
- **Media Handling**: Send images, videos, documents, and audio files.

## 📋 Requirements

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.19.0 or higher (v20 Recommended).
- **pnpm**: The project uses pnpm for dependency management (recommended), though npm can also be used.
- **Database**: MySQL or PostgreSQL instance.

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/baileys-api.git
cd baileys-api
```

### 2. Install Dependencies

We recommend using `pnpm`:

```bash
npm install -g pnpm
pnpm install
```

If you prefer `npm`:

```bash
npm install
```

### 3. Environment Configuration

1.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
2.  Open `.env` and configure the variables:

    ```env
    # Application Settings
    HOST="0.0.0.0"          # Host to bind the server to
    PORT="3000"             # Port to run the server on
    NODE_ENV="development"  # 'development' or 'production'

    # Security
    API_KEY="secret_api_key" # Optional: Secure your API endpoints

    # Database
    # Replace with your actual connection string (MySQL/PostgreSQL)
    DATABASE_URL="mysql://user:password@localhost:3306/baileys_api"

    # WhatsApp Configuration
    NAME_BOT_BROWSER="WhatsApp API" # Browser name shown in WhatsApp Linked Devices
    RECONNECT_INTERVAL="5000"       # Reconnection delay in ms
    MAX_RECONNECT_RETRIES="5"       # Max retries before stopping
    SSE_MAX_QR_GENERATION="10"      # Max QR codes generated before timeout

    # Logging
    LOG_LEVEL="info"
    ```

### 4. Database Setup

Ensure your database server is running, then apply the Prisma schema:

```bash
# For development (updates schema and generates client)
npx prisma migrate dev --name init

# Or just push the schema (good for quick prototyping)
npx prisma db push
```

## 🚀 Running the Application

### Development Mode

Starts the server with hot-reloading:

```bash
npm run dev
# or
pnpm dev
```

### Production Mode

1.  Build the project:
    ```bash
    npm run build
    # or
    pnpm run build
    ```
2.  Start the compiled application:
    ```bash
    npm start
    # or
    pnpm start
    ```

### Using PM2

A `ecosystem.config.cjs` file is included for process management with PM2.

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# Monitor logs
pm2 logs baileys-api
```

## 🐳 Docker Deployment

You can deploy the application using Docker to ensure a consistent environment.

### 1. Build the Image

```bash
docker build -t baileys-api .
```

### 2. Run the Container

Make sure to provide the necessary environment variables, especially the `DATABASE_URL`.

```bash
docker run -d \
  -p 3000:3000 \
  --name baileys-api \
  -e DATABASE_URL="mysql://user:password@host.docker.internal:3306/baileys_api" \
  -e API_KEY="your_secret_key" \
  baileys-api
```

_Note: If your database is running on the host machine, use `host.docker.internal` (Mac/Windows) or `--network="host"` (Linux) to allow the container to access it._

## 📚 API Documentation & Testing

This project comes with integrated **Swagger UI** documentation, making it incredibly easy to understand and test the API endpoints.

### Accessing Swagger UI

Once the application is running, navigate to:

👉 **http://localhost:3000/api-docs**

### How to Test with Swagger

1.  **Authorize**: If you set an `API_KEY` in your `.env`, click the **Authorize** button in Swagger UI and enter your key in the `ApiKeyAuth` section.
2.  **Create a Session**:
    - Go to the `Sessions` section.
    - Use `/sessions/add` (POST) to create a session ID.
    - Or use `/sessions/add-sse` (GET) to get a stream of QR codes for scanning.
3.  **Scan QR**: Use your WhatsApp mobile app to scan the QR code generated.
4.  **Use Endpoints**: Once connected, you can use other endpoints like `/messages/send`, `/groups`, etc.

### Postman

You can also use Postman to test the API. A collection is available (link preserved from original project, verify if valid):

[<img src="https://run.pstmn.io/button.svg" alt="Run In Postman" style="width: 128px; height: 32px;">](https://app.getpostman.com/run-collection/14456337-fb3349c5-de0e-40ec-b909-3922f4a95b7a?action=collection%2Ffork&source=rip_markdown&collection-url=entityId%3D14456337-fb3349c5-de0e-40ec-b909-3922f4a95b7a%26entityType%3Dcollection%26workspaceId%3Dfbd81f05-e0e1-42cb-b893-60063cf8bcd1)

## ⚠️ Important Notes

- **Responsibility**: This project is for educational and internal tool purposes. Do not use it for spamming or violating WhatsApp's Terms of Service.
- **Security**: Always secure your API with an `API_KEY` when deploying to a public server.
- **Sessions**: Session data is stored in the database. Ensure your database is persistent and backed up.

## 📄 License

MIT License
