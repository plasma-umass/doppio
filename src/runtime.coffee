# things assigned to root will be available outside this module
root = exports ? this.runtime = {}

class root.StackFrame
  constructor: (@locals,@stack) ->
    @pc=0

class root.RuntimeState
  constructor: (@constant_pool, initial_args) ->
    @meta_stack = [new root.StackFrame(['fake','frame'],initial_args)]
  cl: (idx) -> #current locals
    _.last(@meta_stack).locals[idx]
  put_cl: (idx,val) ->
    _.last(@meta_stack).locals[idx] = val
  push: (args...) -> #operator for current stack
    #alert "pushing: #{args}" #good for debug (console.log is teh sux)
    for v in args
      @meta_stack[@meta_stack.length-1].stack.push v
  pop: () -> #operator for current stack
    v = @meta_stack[@meta_stack.length-1].stack.pop()
    #alert "popping: #{v}" #good for debug
    v
  curr_pc: () ->
    _.last(@meta_stack).pc
  goto_pc: (pc) ->
    _.last(@meta_stack).pc = pc
  inc_pc: () ->
    _.last(@meta_stack).pc += 1