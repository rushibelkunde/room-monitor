import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/dashboard", "routes/dashboard.tsx"),
  route("/admin/:roomId", "routes/admin.tsx"),
  route("/participant/:roomId", "routes/participant.tsx"),
] satisfies RouteConfig;
