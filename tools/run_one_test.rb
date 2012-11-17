#!/usr/bin/env ruby

require 'tempfile'

$check_mark = [0x2714].pack('U*')  # hack to display it correctly in ruby1.8

def show_errors(name,type,errors)
  if errors.match /\S/
    puts "\nDifferences found in #{type} test for #{name}: -reference, +ours"
    puts errors
    return true
  end
  print $check_mark
end

if ARGV[0].nil?
  puts "Usage: #{$0} TestCase"
  exit -1
end

cls = ARGV[0]
here_dir = "#{Dir.pwd}/#{File.dirname($0)}"
test_dir = "#{here_dir}/../classes/test"
src = "#{test_dir}/#{cls}.java"
name = src.match(/(\w+)\.java/)[1]
Tempfile.open('disasm') do |f|
  # compare disas output
  `#{here_dir}/../console/disassembler.coffee #{test_dir}/#{name}.class >#{f.path()}`
  exit false if show_errors(name,'disasm',`#{here_dir}/cleandiff.sh #{test_dir}/#{name}.disasm #{f.path()}`)
end
Tempfile.open('runtime') do |f|
  # compare runtime output
  `#{here_dir}/../console/runner.coffee #{cls} --log=error 2>&1 >#{f.path()}`
  # -a forces diff to treat file as text. necessary because jvm screwups can
  # cause weird output that confuses diff
  exit false if show_errors(name,'runtime',`diff -U0 -a #{test_dir}/#{name}.runout #{f.path()} | sed '1,2d'`)
end
