const path = require("path");
const express = require("express");
const { createMockMiddleware } = require("openapi-mock-express-middleware");
const swaggerUi = require("swagger-ui-express");
const swaggerDoc = require("../swagger/swagger.json"); //또는 .yaml 파싱

const specPath = path.resolve(__dirname, "../swagger/swagger.json"); // 라이브러리 문서가 절대경로를 권장

const app = express();
app.use("/api", createMockMiddleware({ spec: specPath })); // 목 서버
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc)); // Swagger UI

app.listen(3000);
