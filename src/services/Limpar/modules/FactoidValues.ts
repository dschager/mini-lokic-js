import { AxiosError } from "axios";
import BaseLimparAPI from "../client";

import type { Json } from "../../../types/json";

export interface FactoidValue {
  id: string;
  factoid_id: string;
  values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateFactoidBody {
  state_abbr?: string;
  data_info?: Record<string, unknown>;
  skip_validation?: boolean;
  skip_association_validations?: boolean;
}

export class FactoidValues extends BaseLimparAPI {
    constructor() { super(); }

    async getById(
        id: string,
        include?: Array<"factoid">
    ): Promise<FactoidValue> | never {
        try {
            const response = await this.client.get(`/factoid_values/${id}`, {
                params: (include ? { include } : undefined)
            });

            return response.data;
        } catch (err: unknown) {
            if (err instanceof AxiosError && err.response?.status === 404) {
                throw new Error(`LimparAPI::FactoidValues.getById -> Object with Id=${id} not found`);
            }
            throw err;
        }
    }

    async create(
        factoidId: string,
        values: Json,
        body?: CreateFactoidBody
    ): Promise<FactoidValue> | never {
        try {
            const response = await this.client.post('/factoid_values', {
                factoid_id: factoidId,
                values: values,
                ...body
            })

            console.log("FactoidValues.create response:", response.data);

            return response.data;
        } catch (err: unknown) {
            if (err instanceof AxiosError && err.response?.status === 422) {
                throw new Error(`LimparAPI::FactoidValues.create -> ${JSON.stringify(err.response?.data.errors)}`);
            }
            throw err;
        }
    }
}
