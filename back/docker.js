const spawn = require('child_process').spawn
const { ipcMain } = require('electron');

function startDocker(event, arg) {
	Promise.all([
		startDb(),
	])
		.then(results => {
			const on = true
			const success = results.every(v => v.code === 0)
			if (!success) {
				console.log('startDocker: failed', results)
			}
			event.sender.send('docker-start.done', { on, success })
		})
		.catch(error => {
			console.error(error);
			event.sender.send('docker-start.error', error)
		})
}

function stopDocker(event, arg) {
	Promise.all([
		stopDb(),
	])
		.then(results => {
			const on = false
			const success = results.every(v => v.code === 0)
			if (!success) {
				console.log('stopDocker: failed', results)
			}
			event.sender.send('docker-stop.done', { on, success })
		})
		.catch(error => {
			console.error(error);
			event.sender.send('docker-stop.error', error)
		})
}

function run(command, callback = function(){}) {
	console.log('$', command);
	return new Promise((resolve, reject) => {
		const outputs = []

		const [entry, ...commandArgs] = command.split(' ')
		const cmd = spawn(entry, commandArgs)

		cmd.stdout.on('data', data => {
			const output = {
				text: data.toString(),
				type: 'stdout',
			}
			outputs.push(output)
			callback(output)
		})

		cmd.stderr.on('data', data => {
			const text = data.toString()
			// console.log('ERR', text);
			const output = {
				text: text,
				type: 'stderr',
			}
			outputs.push(output)
			callback(output)
		})

		cmd.on('error', error => {
			// error object cannot be passed to the renderer thread
			reject({
				message: error.message,
				original: error,  // will be empty object `{}`
				stack: error.stack,
			})
		})

		cmd.on('close', code => {
			resolve({ code, outputs })
		})
	})
}

/**
 * @returns {Promise}
 */
function startDb(event, arg) {
	const command = 'docker run --env-file ./.env --name wapcon_mysql mysql:5.7'
	const rxMessage = / \[Note\] mysqld: ready for connections\.\n/

	return new Promise((resolve, reject) => {
		run(command, (output) => {
			if (output.type === 'stderr' && rxMessage.test(output.text)) {
				resolve({ code: 0 })
			}
		})
			.catch(reject)
	})
}

/**
 * @returns {Promise}
 */
function stopDb(event, arg) {
	return run('docker stop wapcon_mysql')
		.then(_ => run('docker rm wapcon_mysql'))
}

module.exports = {
	init() {
		ipcMain.on('docker-start', startDocker)
		ipcMain.on('docker-stop', stopDocker)
		ipcMain.on('db-start', startDb)
		ipcMain.on('db-stop', stopDb)
	},
}
