#!/usr/bin/env ruby

# temporary file names
ours = 'ours.out'
ref  = 'reference.out'

here_dir = "#{Dir.pwd}/#{File.dirname($0)}"
test_dir = "#{here_dir}/../test"
Dir.glob("#{test_dir}/*.java") do |src|
  name = src.match(/(\w+)\.java/)[1]
  `javac #{src}` unless File.exists? "#{test_dir}/#{name}.class"
  `coffee #{here_dir}/../console/disassembler.coffee <#{test_dir}/#{name}.class >#{ours}`
  `javap -c -verbose -classpath #{test_dir} #{name} >#{ref}`
  errors = `#{here_dir}/cleandiff.sh #{ref} #{ours}`
  if errors
    puts "Differences found in #{name}: -reference, +ours"
    puts errors
  else
    puts "#{name} passes"
  end
end
File.unlink ours, ref
