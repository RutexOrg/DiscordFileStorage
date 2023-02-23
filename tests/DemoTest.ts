import { TestSuite, Test, expect } from "testyts";

@TestSuite()
export class DemoTest {

  @Test()
  onePlusOne() {

    expect.toBeEqual(1 + 1, 2);

  }

}