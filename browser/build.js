// Configuration file for RequireJS's optimizer.
({
    baseUrl: '../build/dev',
    name: 'src/runtime',
    out: '../build/release/doppio.js',
    // These aren't referenced from runtime. We may want to decouple them
    // at some point.
    include: ['src/testing', 'src/disassembler'],
    mainConfigFile: 'require_config.js'
})
