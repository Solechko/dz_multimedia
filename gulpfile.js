const browserSync = require('browser-sync').create();
const concat = require('gulp-concat');
const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const sass = require('gulp-sass');
const csso = require('gulp-csso');
const autoprefixer = require('gulp-autoprefixer');
const eslint = require('gulp-eslint');

gulp.task('default', ['server'], () => {
	gulp.watch('src/index.html', (event) => {
		gulp.run('html');
	});
	gulp.watch('src/scss/**', (event) => {
		gulp.run('css');
	});
	gulp.watch('src/js/**', (event) => {
		gulp.run('js');
	});
});

// HTML
gulp.task('html', () => {
	return gulp.src('src/index.html')    
	.pipe(gulp.dest('./dest/'))
	.pipe(browserSync.stream());
});

// CSS
gulp.task('css', () => {
	return gulp.src('src/scss/*.scss')
	.pipe(sourcemaps.init())
	.pipe(concat('style.css'))
	.pipe(sass())
	.pipe(autoprefixer())
	.pipe(csso())
	.pipe(sourcemaps.write('.'))
	.pipe(gulp.dest('./dest/css/'))
	.pipe(browserSync.stream());
});

// JavaScript
gulp.task('js', () => {
	gulp.src('src/js/*.js')
	.pipe(sourcemaps.init())
	.pipe(eslint())
	.pipe(concat('script.js'))
	.pipe(uglify())
	.pipe(sourcemaps.write('.'))
	.pipe(gulp.dest('dest/js'))
	.pipe(browserSync.stream());
});

// Server
gulp.task('server', () => {
	browserSync.init({
		server: {
			baseDir: './dest/'
		},
		open: true
	});
});