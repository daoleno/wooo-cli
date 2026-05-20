import { defineCommand } from "citty";
import { loadWoooConfig } from "../../core/config";
import {
  checkCredentialField,
  getCredentialService,
} from "../../core/credentials";
import { createOutput, resolveOutputOptions } from "../../core/output";

export default defineCommand({
  meta: {
    name: "status",
    description: "Show configured credential slots without revealing secrets",
  },
  args: {
    service: {
      type: "positional",
      description: "Credential service, for example okx or okx-onchain",
      required: true,
    },
    json: { type: "boolean", default: false },
    format: { type: "string", default: "table" },
  },
  async run({ args }) {
    const out = createOutput(resolveOutputOptions(args));
    const service = getCredentialService(args.service);
    const config = await loadWoooConfig();
    const rows = await Promise.all(
      service.fields.map(async (field) => {
        const status = await checkCredentialField({
          config,
          field,
          service,
        });
        return {
          field: field.key,
          label: field.label,
          present: status.present,
          source: status.source,
          ref: status.ref,
        };
      }),
    );

    if (args.json || args.format === "json") {
      out.data({
        service: service.id,
        label: service.label,
        credentials: rows,
      });
      return;
    }

    out.table(rows, {
      title: `${service.label} credentials`,
      columns: ["field", "present", "source", "ref"],
    });
  },
});
