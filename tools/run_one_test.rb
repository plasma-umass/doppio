#!/usr/bin/env ruby

require 'tempfile'

def show_errors(name,type,errors)
  if errors.match /\S/
    puts "Differences found in #{type} test for #{name}: -reference, +ours"
    puts errors
    return true
  end
  puts "#{name} passes #{type} test"
end

if ARGV[0].nil?
  puts "Usage: $0 TestCase"
  exit -1
end

cls = ARGV[0]
here_dir = "#{Dir.pwd}/#{File.dirname($0)}"
test_dir = "#{here_dir}/../test"
src = "#{test_dir}/#{cls}.java"
name = src.match(/(\w+)\.java/)[1]
Tempfile.open('disasm') do |f|
  # compare disas output
  `#{here_dir}/../console/disassembler.coffee #{test_dir}/#{name}.class >#{f.path()}`
  exit if show_errors(name,'disasm',`#{here_dir}/cleandiff.sh #{test_dir}/#{name}.disasm #{f.path()}`)
end
Tempfile.open('runtime') do |f|
  # compare runtime output
  `#{here_dir}/../console/runner.coffee #{test_dir}/#{name}.class --log=error 2>&1 >#{f.path()}`
  # -a forces diff to treat file as text. necessary because jvm screwups can
  # cause weird output that confuses diff
  show_errors(name,'runtime',`diff -U0 -a #{test_dir}/#{name}.runout #{f.path()} | sed '1,2d'`)
end
