"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var lodash = require("lodash");
var ts = require("typescript");
var benchmark_1 = require("../shared/benchmark");
var project_1 = require("../shared/project");
var Compiler = (function () {
    function Compiler(log, project) {
        var _this = this;
        this.log = log;
        this.project = project;
        this.COMPILE_DELAY = 250;
        this.compiledFiles = {};
        this.emitQueue = [];
        this.compileDeferred = lodash.debounce(function () {
            _this.compileProject();
        }, this.COMPILE_DELAY);
        this.getSourceFile = function (filename, languageVersion, onError) {
            if (_this.cachedProgram && !_this.isQueued(filename)) {
                var sourceFile = _this.cachedProgram.getSourceFile(filename);
                if (sourceFile) {
                    return sourceFile;
                }
            }
            return _this.hostGetSourceFile(filename, languageVersion, onError);
        };
    }
    Compiler.prototype.compile = function (file, callback) {
        this.emitQueue.push({
            file: file,
            callback: callback
        });
        this.compileDeferred();
    };
    Compiler.prototype.compileProject = function () {
        this.log.info("Compiling project using Typescript %s", ts.version);
        if (this.project.handleFileEvent() === project_1.EventType.FileSystemChanged) {
            this.setupRecompile();
        }
        var benchmark = new benchmark_1.Benchmark();
        var tsconfig = this.project.getTsconfig();
        this.outputDiagnostics(tsconfig.errors);
        this.program = ts.createProgram(tsconfig.fileNames, tsconfig.options, this.compilerHost);
        this.cachedProgram = this.program;
        this.runDiagnostics(this.program, this.compilerHost);
        this.program.emit();
        this.log.info("Compiled %s files in %s ms.", tsconfig.fileNames.length, benchmark.elapsed());
        this.onProgramCompiled();
    };
    Compiler.prototype.setupRecompile = function () {
        var _this = this;
        this.cachedProgram = undefined;
        this.compilerHost = ts.createCompilerHost(this.project.getTsconfig().options);
        this.hostGetSourceFile = this.compilerHost.getSourceFile;
        this.compilerHost.getSourceFile = this.getSourceFile;
        this.compilerHost.writeFile = function (filename, text) {
            _this.compiledFiles[filename] = text;
        };
    };
    Compiler.prototype.onProgramCompiled = function () {
        var _this = this;
        this.emitQueue.forEach(function (queued) {
            var sourceFile = _this.program.getSourceFile(queued.file.originalPath);
            if (!sourceFile) {
                throw new Error("No source found for " + queued.file.originalPath + "!\n" +
                    "Is there a mismatch between the Typescript compiler options and the Karma config?");
            }
            queued.callback({
                isDeclarationFile: ts.isDeclarationFile(sourceFile),
                outputText: _this.compiledFiles[queued.file.path],
                sourceFile: sourceFile,
                sourceMapText: _this.compiledFiles[queued.file.path + ".map"]
            });
        });
        this.emitQueue.length = 0;
    };
    Compiler.prototype.isQueued = function (filename) {
        for (var _i = 0, _a = this.emitQueue; _i < _a.length; _i++) {
            var queued = _a[_i];
            if (queued.file.originalPath === filename) {
                return true;
            }
        }
        return false;
    };
    Compiler.prototype.runDiagnostics = function (program, host) {
        var diagnostics = ts.getPreEmitDiagnostics(program);
        this.outputDiagnostics(diagnostics, host);
    };
    Compiler.prototype.outputDiagnostics = function (diagnostics, host) {
        var _this = this;
        if (diagnostics && diagnostics.length > 0) {
            diagnostics.forEach(function (diagnostic) {
                if (ts.formatDiagnostics) {
                    _this.log.error(ts.formatDiagnostics([diagnostic], host));
                }
                else {
                    var output = "";
                    if (diagnostic.file) {
                        var loc = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
                        output += diagnostic.file.fileName.replace(process.cwd(), "") +
                            "(" + (loc.line + 1) + "," + (loc.character + 1) + "): ";
                    }
                    var category = ts.DiagnosticCategory[diagnostic.category].toLowerCase();
                    output += category + " TS" + diagnostic.code + ": " +
                        ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine) + ts.sys.newLine;
                    _this.log.error(output);
                }
            });
            if (this.project.getTsconfig().options.noEmitOnError) {
                ts.sys.exit(ts.ExitStatus.DiagnosticsPresent_OutputsSkipped);
            }
        }
    };
    return Compiler;
}());
exports.Compiler = Compiler;
