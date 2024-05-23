/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import FormData from "form-data";

export function callWebHook(url: string, body: any, response?: (data: any) => void) {
	console.log("callWebHook");

	axios
		.post(url, body)
		.then((res) => {
			console.log("callWebHook response", res.status, res.data);

			if (res.status === 200 && response) response(res.data);
		})
		.catch((err) => {
			console.log("Error calling webhook", err.message);
		});
}

export async function callWebHookFile(
	client: any,
	event: any,
	buffer: any,
	response?: (data: any) => void,
) {
	try {
		const webhook = client?.config.url || false;
		if (!webhook) throw new Error("Webhook URL is not defined");

		const { remoteJid, id, fileFormat } = event.config;

		const formData = new FormData();
		formData.append("remoteJid", remoteJid);
		formData.append("id", id);
		formData.append("session", client.session);
		formData.append("messageType", client.messageType);
		formData.append("file", buffer, { filename: `file.${fileFormat}` });

		const data = await axios.post(webhook, formData, {
			headers: formData.getHeaders(),
		});

		if (data.status === 200 && response) response(data.data);
	} catch (error) {
		console.log("Error calling webhook", error);
	}
}
