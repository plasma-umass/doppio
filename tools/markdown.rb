#!/usr/bin/env ruby

require 'rdiscount'
markdown = RDiscount.new(ARGF.read)
puts markdown.to_html
