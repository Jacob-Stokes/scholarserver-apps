import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicJson } from "@scholarserver/controller-runtime/files";

const expectedServiceUrl = "http://scholarserver-manager:8080/api/v1/service";

export class ManagerConnection {
  constructor(directory) {
    this.file = path.join(directory, "manager-connection.json");
  }

  async configure(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value.url !== expectedServiceUrl ||
      typeof value.token !== "string" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(value.token)
    ) {
      throw new Error("ScholarServer did not provide a valid application service credential");
    }
    await atomicJson(this.file, { url: value.url, token: value.token });
  }

  async read() {
    let value;
    try {
      value = JSON.parse(await readFile(this.file, "utf8"));
    } catch {
      throw new Error("Reconnect this automation platform from ScholarServer");
    }
    if (
      value?.url !== expectedServiceUrl ||
      typeof value.token !== "string" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(value.token)
    ) {
      throw new Error("Reconnect this automation platform from ScholarServer");
    }
    return value;
  }
}
