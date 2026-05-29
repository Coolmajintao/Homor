import "dotenv/config";

import Openai from "openai";
export const client = new Openai({
  apiKey: process.env.apiKey,
  baseURL: process.env.baseUrl,
});
