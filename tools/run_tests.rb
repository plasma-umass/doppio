#!/usr/bin/env ruby

# temporary file names
ours = 'ours.out'

here_dir = "#{Dir.pwd}/#{File.dirname($0)}"
test_dir = "#{here_dir}/../test"
`make disasm` # build the reference disasm from javap
Dir.glob("#{test_dir}/*.java") do |src|
  name = src.match(/(\w+)\.java/)[1]
  `#{here_dir}/../console/disassembler.coffee #{test_dir}/#{name}.class >#{ours}`
  errors = `#{here_dir}/cleandiff.sh #{test_dir}/#{name}.disasm #{ours}`
  if errors.match /\S/
    puts "Differences found in #{name}: -reference, +ours"
    puts errors
  else
    puts "#{name} passes"
  end
end
File.unlink ours
