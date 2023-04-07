import axios from "axios";
import axiosRetry from "axios-retry";

const client = axios.create();

axiosRetry(client, { retries: 3 });

export default client;