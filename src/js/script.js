(function () {
	var GL_TIME = 0;
	var GL_TIME_UNIFORM = null;
	var SUBTITLE_FONT = '22px Oranienbaum';
	var SUBTITLE_LINE_HEIGHT = 26;
	var SUBTITLE_WIDTH = 0.8;
	var SUBTITLE_BACK_COLOR = 'black';
	var SUBTITLE_FONT_COLOR = 'white';
	var VIDEO_WIDTH = 720;
	var VIDEO_HEIGHT = 405;

	var isVideoPlaying;
	var isSubtitlePlaying;
	var currentSubtitle;
	var timer;
	var gainNode;
	
	var video = document.getElementById('source-video');
	var overlayVideo = document.getElementById('overlay-video');
	var canvas = document.getElementById('canvas');
	var context = canvas.getContext('2d');	
	var overlayCanvas = document.getElementById('overlay-canvas');
	var overlayContext = overlayCanvas.getContext('2d');
	var webglCanvas = document.getElementById('webgl-canvas');
	var webglContext = webglCanvas.getContext('webgl') || webglCanvas.getContext('experimental-webgl');
	var audio = document.getElementById('audio');

	var play = document.getElementById('play-button');
	var volume = document.getElementById('volume-button');	
	var playRange = document.getElementById('play-range');
	var volumeRange = document.getElementById('volume-range');

	overlayVideo.width = canvas.width = overlayCanvas.width = webglCanvas.width = VIDEO_WIDTH;
	overlayVideo.height = canvas.height = overlayCanvas.height = webglCanvas.height = VIDEO_HEIGHT;

	video.addEventListener('ended', pauseVideo);

	setControls();
	prepareAudio();
	prepareWebGL(webglCanvas, webglContext, canvas);
	
	var subtitles = new SrtSubtitles('files/subs.srt', function() {
		currentSubtitle = subtitles.getCurSub();
		playVideo();
	});

	// Инициализация элементов управления и их подписка на события мыши
	function setControls() {
		playRange.value = 0;
		volumeRange.value = 100;

		play.addEventListener('click', playPauseVideo);
		volume.addEventListener('click', turnOnOffVolume);
		playRange.addEventListener('mousedown', switchVideoStart);
		playRange.addEventListener('mouseup', switchVideoEnd);
		volumeRange.addEventListener('mousemove', changeVolume);

		// Запустить/остановить видео
		function playPauseVideo() {
			if (!isVideoPlaying) {
				playVideo();
			} else {
				pauseVideo();
			}
		}

		// Включить/выключить звук
		function turnOnOffVolume() {
			if (audio.muted) {
				audio.muted = false;
				volume.classList.remove('volume-button-mute');
			} else {
				audio.muted = true;
				volume.classList.add('volume-button-mute');
			}
		}

		// Нажатие на элемент перемещения по видео
		function switchVideoStart() {
			pauseVideo();			
		}

		// Отжатие элемента перемещения по видео
		function switchVideoEnd() {
			var x = playRange.value;			
			video.currentTime = video.duration * playRange.value / 100;
			subtitles.moveTargetSub(moment(video.currentTime, 'ss'));
			isSubtitlePlaying = false;
			playVideo();
		}

		// Изменение громкости
		function changeVolume() {
			gainNode.gain.value = volumeRange.value / 100;
		}
	}

	// Поставить видео на паузу
	function playVideo() {
		video.play();
		overlayVideo.play();
		audio.play();
		isVideoPlaying = true;
		requestAnimationFrame(mainLoop);
		play.classList.add('play-button-paused');
	}

	// Запустить воспроизведение видео
	function pauseVideo() {
		video.pause();
		overlayVideo.pause();
		audio.pause();
		isVideoPlaying = false;	
		play.classList.remove('play-button-paused');
	}	

	// Основной цикл отрисовки
	function mainLoop(t) {
		GL_TIME = t;
		playRange.value = video.currentTime / video.duration * 100;
		context.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
		checkDrawSubtitles();
		overlayContext.drawImage(overlayVideo, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
		postprocess(canvas, context, overlayCanvas);
		postprocessWebGL(webglCanvas, webglContext, canvas);
			 
		if (isVideoPlaying) {
			requestAnimationFrame(mainLoop);
		}
	}

	// Проверка необходимости отрисовки субтитров и отрисовка
	function checkDrawSubtitles() {
		if (isSubtitlePlaying) {
			showSubtitles(currentSubtitle.text);
		}
		else {
			var curPlayTime = moment('0', 'ss');
			var playDuration = moment.duration(video.currentTime, 'seconds');
			curPlayTime.add(playDuration);
			// Проверяем, не наступило ли время проигрывания очередного субтитра
			if (curPlayTime >= subtitles.getCurSub().startTime) {
				currentSubtitle = subtitles.getCurSub();
				subtitles.moveNextSub();
				isSubtitlePlaying = true;
					
				showSubtitles(currentSubtitle.text);
				video.pause();

				timer = setTimeout(function () {
					isSubtitlePlaying = false;
					if (isVideoPlaying)
						video.play();
				}, currentSubtitle.duration);
			}
		}
	}

	// Подготовка аудио, инициализация узлов обработки
	function prepareAudio() {
		var audioCtx = new AudioContext();
		var source = audioCtx.createMediaElementSource(audio);
		var biquadFilter = audioCtx.createBiquadFilter();
		var distortion = audioCtx.createWaveShaper();
		gainNode = audioCtx.createGain();

		// Последовательное подключение узлов обработки аудио
		source.connect(biquadFilter);
		biquadFilter.connect(distortion);
		distortion.connect(gainNode);
		gainNode.connect(audioCtx.destination);
	
		// Настройки усзлов обработки
		gainNode.gain.value = 1;
		biquadFilter.type = 'allpass';
		distortion.curve = makeDistortionCurve(30);
		distortion.oversample = '4x';

		// Функции генерации кривой искажения
		function makeDistortionCurve(amount) {
			var k = typeof amount === 'number' ? amount : 50,
				n_samples = 44100,
				curve = new Float32Array(n_samples),
				deg = Math.PI / 180,
				i = 0,
				x;
			for ( ; i < n_samples; ++i ) {
				x = i * 2 / n_samples - 1;
				curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
			}
			return curve;
		}
	}

	// Настройка WebGL для работы на графическом процессоре
	function prepareWebGL(canvas, gl, sourceCanvas) {
		var program = gl.createProgram();

		var vertexCode = 'attribute vec2 coordinates;' +
			'attribute vec2 texture_coordinates;' +
			'varying vec2 v_texcoord;' +
			'void main() {' +
			'  gl_Position = vec4(coordinates,0.0, 1.0);' +
			'  v_texcoord = texture_coordinates;' +
			'}';

		var vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, vertexCode);
		gl.compileShader(vertexShader);

		var fragmentCode = 'precision mediump float;' +
			'varying vec2 v_texcoord;' +
			'uniform sampler2D u_texture;' +
			'uniform float u_time;' +
			'float rand(vec2 co){' +
			'   return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);' +
			'}' +
			'void main() {' +
			'	vec4 v = texture2D(u_texture, v_texcoord);' +
			'	float f = 0.299 * v.r +  0.587 * v.g + 0.114 * v.b;' +	  
			'	v.rgb = vec3(f, f, f);' +   
			'   gl_FragColor = v * .8 + v * rand(v_texcoord * u_time) * .2;' +
			'}';

		var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, fragmentCode);
		gl.compileShader(fragmentShader);

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);

		gl.linkProgram(program);
		gl.useProgram(program);

		var positionLocation = gl.getAttribLocation(program, 'coordinates');
		var texcoordLocation = gl.getAttribLocation(program, 'texture_coordinates');
		GL_TIME_UNIFORM = gl.getUniformLocation(program, 'u_time');

		var buffer = gl.createBuffer();
		var vertices = [
			-1, -1,
			1, -1,
			-1, 1,
			-1, 1,
			1, -1,
			1, 1
		];
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

		buffer = gl.createBuffer();
		var textureCoordinates = [
			0, 1,
			1, 1,
			0, 0,
			0, 0,
			1, 1,
			1, 0
		];
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(texcoordLocation);
		gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);
	}

	// Конвертация кадра в черно-белое изображение и добавление шума на графическом процессоре
	function postprocessWebGL(canvas, gl, sourceCanvas) {
		gl.uniform1f(GL_TIME_UNIFORM, GL_TIME / 1000);
		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

		gl.viewport(0,0,canvas.width,canvas.height);
		gl.enable(gl.DEPTH_TEST);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.deleteTexture(texture);
	}
	
	// Наложение кадра с царапинами на кадр основного видео потока
	function postprocess(canvas, context, overlayCanvas) {
		context.globalCompositeOperation = 'multiply';
		context.drawImage(overlayCanvas, 0, 0);
		context.globalCompositeOperation = 'source-over';
	}

	// Отобразить субтитры
	function showSubtitles(text) {
		context.save();	
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = SUBTITLE_BACK_COLOR;
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = SUBTITLE_FONT_COLOR;
		context.font = SUBTITLE_FONT;
		context.textAlign = 'center';
		context.textBaseline = 'middle';

		// Разбиваем текст на строки
		var subtitleLines = splitToLines(text);

		var resultSubtitleLines = [];
		// Разбиваем широкие строки на несколько строк
		for (var i = 0; i < subtitleLines.length; i++) {
			var curSubLine = subtitleLines[i];
			if (context.measureText(curSubLine).width > canvas.width) {
				var newLines = wordWrapLine(curSubLine, canvas.width * SUBTITLE_WIDTH);
				newLines.forEach(function(newLine) {
					resultSubtitleLines.push(newLine);
				});
			}
			else {
				resultSubtitleLines.push(curSubLine);
			}
		};

		// Перемещаемся в центр экрана
		context.translate(canvas.width / 2, canvas.height / 2);
		// Расчитываем координаты Y для вывода первой строки
		var posY = -((resultSubtitleLines.length * SUBTITLE_LINE_HEIGHT) / 2);
		// Выводим строки на канву
		for (var i = 0; i < resultSubtitleLines.length; i++) {
			context.fillText(resultSubtitleLines[i], 0, posY);
			posY += SUBTITLE_LINE_HEIGHT;
		};
		context.restore();
	}

	// Разделение строки на несколько, если она шире максимального значения ширины
	function wordWrapLine(text, maxWidth) {
		var resultLines = [];
		var words = text.split(' ');
		var curLine = '';
		for(var j = 0; j < words.length; j++) {
			var subLine = curLine + words[j] + ' ';
			var curWidth = context.measureText(subLine).width;
			if (curWidth > maxWidth) {
				resultLines.push(curLine);
				curLine = words[j] + ' ';
			}
			else {
				curLine = subLine;
			}
		}
		resultLines.push(curLine);
		return resultLines;
	}

	// Разбить текст на строки
	function splitToLines(text) {
		return text.split(/\r?\n/);
	}
})();