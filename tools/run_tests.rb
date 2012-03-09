#!/usr/bin/env ruby

def show_errors(name,type,errors)
  if errors.match /\S/
    puts "Differences found in #{type} test for #{name}: -reference, +ours"
    puts errors
  else
    puts "#{name} passes #{type} test"
  end
end

# temporary file names
ours_run = 'ours.runout'
ours_dis = 'ours.disasm'

here_dir = "#{Dir.pwd}/#{File.dirname($0)}"
test_dir = "#{here_dir}/../test"
`make all` # build the reference *.disasm,*.runout from the real jvm
Dir.glob("#{test_dir}/*.java") do |src|
  name = src.match(/(\w+)\.java/)[1]
  # compare disas output
  `#{here_dir}/../console/disassembler.coffee #{test_dir}/#{name}.class >#{ours_dis}`
  show_errors(name,'disasm',`#{here_dir}/cleandiff.sh #{test_dir}/#{name}.disasm #{ours_dis}`)
  # compare runtime output
  `#{here_dir}/../console/runner.coffee #{test_dir}/#{name}.class --log=error 2>&1 >#{ours_run}`
  show_errors(name,'runtime',`diff -U0 #{test_dir}/#{name}.runout #{ours_run} | sed '1,2d'`)
end
File.unlink ours_dis,ours_run
