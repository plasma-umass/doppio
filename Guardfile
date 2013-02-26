# run using `bundle exec guard -i`

group :release do
  guard :shell do
    watch(%r{((src|console)/.*)\.coffee$}) { |m|
      `make release-cli`
    }
  end
end

group :dev do
  guard :shell do
    watch(%r{((src|console)/.*)\.coffee$}) { |m|
      `make dev-cli`
    }
  end
end
