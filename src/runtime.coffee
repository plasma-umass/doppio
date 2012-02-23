# things assigned to root will be available outside this module
root = exports ? this.runtime = {}

class root.StackFrame
  constructor: (@locals,@stack) ->
    @pc=0

class root.RuntimeState
  constructor: (@constant_pool, @print, initial_args) ->
    @meta_stack = [new root.StackFrame(['fake','frame'],initial_args)]
  cl: (idx) -> #current locals
    _.last(@meta_stack).locals[idx]
  put_cl: (idx,val) ->
    _.last(@meta_stack).locals[idx] = val
  push: (args...) -> #operator for current stack
    for v in args
      @meta_stack[@meta_stack.length-1].stack.push v
  pop: () -> #operator for current stack
    @meta_stack[@meta_stack.length-1].stack.pop()
  curr_pc: () ->
    _.last(@meta_stack).pc
  goto_pc: (pc) ->
    _.last(@meta_stack).pc = pc
  inc_pc: (n) ->
    _.last(@meta_stack).pc += n