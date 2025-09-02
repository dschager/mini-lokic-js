import "dotenv/config";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

class BaseLimparAPI {
    protected client: AxiosInstance;
    protected token: string | null = null;

    constructor() {
        this.client = axios.create({
            baseURL: process.env.LIMPAR_BASE_URL
        });

        this.client.interceptors.request.use(async (config) => {
            if (!this.token) { await this.authenticate(); }

            config.headers.Authorization = `Bearer ${this.token}`;
            return config;
        });

        this.client.interceptors.response.use(
            (response) => response,
            async (err) => {
                if (err.response?.status === 401 && !err.config._retry) {
                    err.config._retry = true;

                    await this.authenticate();

                    err.config.headers.Authorization = `Bearer ${this.token}`;

                    return this.client(err.config);
                }
                return Promise.reject(err);
            }
        );
    }

    private async authenticate(): Promise<void> {
        try {
            const response: AxiosResponse<{ token: string }> = await axios.post(
                `${process.env.LIMPAR_BASE_URL}/authenticate`,
                {
                    email: process.env.LIMPAR_EMAIL,
                    password: process.env.LIMPAR_PASSWORD
                }
            );
            this.token = response.data.token;
        } catch (err) {
            console.error("Auth failed:", (err as Error).message);
            throw err;
        }
    }

    protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const { data } = await this.client.get<T>(url, config);
        return data;
    }

    protected async post<T>(url: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
        const { data } = await this.client.post<T>(url, body, config);
        return data;
    }

    protected async patch<T>(url: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
        const { data } = await this.client.patch<T>(url, body, config);
        return data;
    }

    protected async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const { data } = await this.client.delete<T>(url, config);
        return data;
    }
}

export default BaseLimparAPI;
