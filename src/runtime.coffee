# things assigned to root will be available outside this module
root = exports ? this.runtime = {}

class root.StackFrame
  constructor: (@locals,@stack) ->
    @pc=0

class root.RuntimeState
  constructor: (@class_data, @print, initial_args) ->
    @meta_stack = [new root.StackFrame(['fake','frame'],initial_args)]
  curr_frame: () -> _.last(@meta_stack)
  cl: (idx) -> #current locals
    @curr_frame().locals[idx]
  put_cl: (idx,val) ->
    @curr_frame().locals[idx] = val
  push: (args...) -> #operator for current stack
    cs = @curr_frame().stack
    for v in args
      cs.push v
  pop: () -> #operator for current stack
    @curr_frame().stack.pop()
  curr_pc: () ->
    @curr_frame().pc
  goto_pc: (pc) ->
    @curr_frame().pc = pc
  inc_pc: (n) ->
    @curr_frame().pc += n
  method_by_name: (name) ->
    _.find(@class_data.methods, (m) -> m.name == name)