import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("auto", "routes/auto.tsx")] satisfies RouteConfig;
