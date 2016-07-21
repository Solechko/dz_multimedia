// Реализует загрузку и навигацию по субтитрам
function SrtSubtitles(srtFileUrl, loadedCallback) {
	var SRT_TIME_FORMAT = 'HH:mm:ss,SSS';

	var srtData = [];
	var curSub = {};
	var subIndex = 0;
	
	// Получаем файл субтитров с сервера
	var client = new XMLHttpRequest();
	client.open('GET', srtFileUrl);
	client.onreadystatechange = checkLoadStatus;
	client.send();

	// Проверить статус загрузки файла субтитров
	function checkLoadStatus() {
		if(client.readyState === 4)  {
			if (client.status === 200) {
				var srtText = client.responseText;
				srtData = parser.fromSrt(srtText);
				resetSubPosition();
				loadedCallback();
			}
			else if (client.status === 404) { 
				console.log('Can not load srt file');
			}
		}
	}

	// Сбросить текущее значение к первому субтитру
	function resetSubPosition() {
		subIndex = 0;
		moveNextSub();
	}

	// Переместиться к следующему субтитру
	function moveNextSub() {
		var curSrtSub = srtData[subIndex];
		if (curSrtSub !== undefined) {
			createSub(curSrtSub);
		}
		subIndex++;
	}

	// Переместиться к заданному по времени субтитру
	function moveTargetSub(time) {
		i = 0;
		var curTime = moment(time);
		var curSubTime = moment(srtData[i].startTime, SRT_TIME_FORMAT);
		while (curSubTime < curTime) {
			i++;
			curSubTime = moment(srtData[i].startTime, SRT_TIME_FORMAT);
		}
		subIndex = i;
		curSub = createSub(srtData[i]);
	}

	// Получить текущий субтитр
	function getCurSub() {
		return curSub;
	}

	// Создать объект субтитра
	function createSub(curSrtSub) {
		var startTime = moment(curSrtSub.startTime, SRT_TIME_FORMAT);
		var endTime = moment(curSrtSub.endTime, SRT_TIME_FORMAT);
		var duration = endTime.diff(startTime, 'milliseconds');
		curSub = {
			subIndex: subIndex,
			startTime: startTime,
			endTime: endTime,
			duration: duration,
			text: curSrtSub.text
		};
		return curSub;
	}

	return {
		getCurSub: getCurSub,
		moveNextSub: moveNextSub,
		moveTargetSub: moveTargetSub,
		resetSubPosition: resetSubPosition
	}
}