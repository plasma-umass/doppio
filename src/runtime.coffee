# things assigned to root will be available outside this module
root = exports ? this.runtime = {}

class root.StackFrame
  constructor: (@locals,@stack) ->
    @pc = 0

class root.RuntimeState
  constructor: (@class_data, @print, initial_args) ->
    @meta_stack = [new root.StackFrame(['fake','frame'],initial_args)]
    @heap = []

  curr_frame: () -> _.last(@meta_stack)

  cl: (idx) -> @curr_frame().locals[idx]
  put_cl: (idx,val) -> @curr_frame().locals[idx] = val
  # useful for category 2 values (longs, doubles)
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,undefined)

  push: (args...) ->
    cs = @curr_frame().stack
    for v in args
      cs.push v

  pop: () -> @curr_frame().stack.pop()
  # useful for category 2 values (longs, doubles)
  pop2: () -> @pop(); @pop()

  # program counter manipulation
  curr_pc: ()   -> @curr_frame().pc
  goto_pc: (pc) -> @curr_frame().pc = pc
  inc_pc:  (n)  -> @curr_frame().pc += n

  method_by_name: (name) -> _.find(@class_data.methods, (m)-> m.name is name)
