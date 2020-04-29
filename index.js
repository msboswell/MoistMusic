const Discord = require("discord.js");
const { prefix, token, youtubeKey, port } = require("./config.json");
const ytdl = require("ytdl-core");
const search = require("youtube-search");

// register client
const client = new Discord.Client();
client.login(token);

// simple event listeners
client.once("ready", () => {
	console.log("Ready!");
});

client.once("reconnectiong", () => {
	console.log("Reconnecting...");
});

client.once("disconnect", () => {
	console.log("Disconnected.");
});

const queue = new Map();

// message received
client.on("message", async message => {
	if (message.author.bot) return;
	if (!message.content.startsWith(prefix)) return;


	const serverQueue = queue.get(message.guild.id);

	let content = message.content.replace(prefix, ""); // remove prefix
	let args = content.split(" ");

	switch (args[0]) {
		case "play":
			// parse argument as youtube link
			if (args.length < 2) {
				return message.channel.send("Tell me what to play: `!play <song>`");
			}
			let song = args.slice(1, args.length).join(" ");
			const opts = { maxResults: 3, key: youtubeKey };
			search(song, opts, (e, results) => {
				if (e) return console.log(e);
				// process results
				const { link } = results[0];
				execute(message, serverQueue, link);
			});
			break;

		case "skip":
			skip(message, serverQueue);
			break;

		case "stop":
			stop(message, serverQueue);
			break;

		default:
			console.log(`not recognized: ${args[0]}, ${content}`);
			message.channel.send(`Command not recognized: ${content}`)
	}
});

const execute = async (message, serverQueue, link) => {
	const voiceChannel = message.member.voice.channel;
	if (!voiceChannel) {
		return message.channel.send("You need to be in a voice channel to play music.");
	}
	const permissions = voiceChannel.permissionsFor(message.client.user);
	if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
		return message.channel.send("I need permission to join and speak in your voice channel.");
	}
	// get song info from given youtube link
	const { title, video_url } = await ytdl.getInfo(link);
	const song = { title, url: video_url };
	if (!serverQueue) {
		// create contract
		const contract = {
			textChannel: message.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(message.guild.id, contract);
		contract.songs.push(song);

		// join voice chat and play song
		try {
			let connection = await voiceChannel.join();
			contract.connection = connection;
			// start playing song
			play(message.guild, contract.songs[0]);
		} catch (err) {
			console.log(err);
			queue.delete(message.guild.id);
			return message.channel.send(err);
		}

	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		return message.channel.send(`${song.title} has been added to the queue`);
	}
};

const play = (guild, song) => {
	const serverQueue = queue.get(guild.id);
	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	const dispatcher = serverQueue.connection
		.play(ytdl(song.url))
		.on("finish", () => {
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]); // play next song
		})
		.on("error", e => console.error(e));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
	serverQueue.textChannel.send(`Start playing: ${song.title}`);
};

const skip = (message, serverQueue) => {
	if (!message.member.voice.channel) {
		return message.channel.send("You have to be in a voice channel to stop the music!");
	}
	if (!serverQueue) {
		return message.channel.send("No song to skip, idiot.");
	}
	serverQueue.connection.dispatcher.end();
};

const stop = (message, serverQueue) => {
	skip(message, serverQueue);
	if (serverQueue) {
		serverQueue.songs = [];
	}
};
