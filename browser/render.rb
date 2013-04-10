#! /usr/bin/env ruby

require 'rubygems'
require 'bundler/setup'
require 'optparse'
require 'mustache'
require 'rdiscount'

options = {}
OptionParser.new do |opts|
  opts.on('--release') { |b| options[:release] = true }
end.parse!

dirname = File.dirname __FILE__

Mustache.template_path = dirname

template_name = ARGV[0]

print Mustache.render File.read("#{dirname}/#{template_name}.mustache"),
  case template_name
  when 'index'
    {
      :git_hash => `git rev-parse HEAD`.strip!,
      :git_short_hash => `git rev-parse --short HEAD`.strip!,
      :date => Time.new.strftime('%b %d %Y'),
      :release => options[:release]
    }
  when 'about'
    {
      :about => RDiscount.new(File.read "#{dirname}/_about.md").to_html,
      :release => options[:release]
    }
  end
